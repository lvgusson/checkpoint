// Integração dos repositórios Postgres. Só roda com DATABASE_URL definida:
//   node --env-file=.env --test api/test/pg.test.ts
// Cria um app_user temporário com cópias de algumas entradas do seed e o apaga no fim
// (ON DELETE CASCADE limpa biblioteca, ajustes, eventos e configuração).
// Só edita campos pessoais (library_entry): o catálogo global (game) não é alterado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, closeDb } from '../src/db.ts';
import { createAppUserResolver, SEED_APP_USER_ID } from '../src/app-user.ts';
import {
  PgGameRepository,
  PgManualAdjustmentRepository,
  PgQueueInputsReader,
  PgScoringConfigRepository,
} from '../src/pg-repository.ts';
import { GameService } from '../src/service.ts';
import { runWithContext } from '../src/context.ts';
import { recommendGames, defaultConfig } from '../src/scoring.ts';
import { seedGames } from '../src/seed.ts';

const url = process.env.DATABASE_URL;

test(
  'repositórios Pg: lista, edita, calcula a fila, reordena e zera',
  { skip: !url && 'DATABASE_URL não definida' },
  async () => {
    const sql = db(url);
    const userId = randomUUID();
    const user = createAppUserResolver(sql);
    const games = new PgGameRepository(sql, user);
    const manual = new PgManualAdjustmentRepository(sql, user);
    const inputs = new PgQueueInputsReader(sql, user);
    const settings = new PgScoringConfigRepository(sql, user);
    const service = new GameService(games, manual, inputs, settings);
    try {
      await sql`INSERT INTO app_user (id, display_name) VALUES (${userId}, 'pg.test')`;
      // 16 jogos do seed com campanha finita, todos pendentes (entram na fila).
      await sql`
        INSERT INTO library_entry (user_id, game_id, status, desire, store_id, platform, notes, imported)
        SELECT ${userId}, e.game_id, 'not_started', e.desire, e.store_id, e.platform, '', e.imported
          FROM library_entry e
         WHERE e.user_id = ${SEED_APP_USER_ID} AND NOT e.is_endless
         ORDER BY e.id LIMIT 16`;
      await runWithContext({ appUserId: userId }, async () => {
        const list = await games.list();
        assert.equal(list.length, 16);
        const seed = new Map(seedGames.map((g) => [g.id, g]));
        for (const g of list) {
          const s = seed.get(g.id)!;
          assert.equal(g.name, s.name);
          assert.equal(g.primaryGenre, s.primaryGenre);
          assert.equal(g.mechanic, s.mechanic);
          assert.equal(g.desire, s.desire);
          assert.equal(g.status, 'Não iniciado');
          assert.equal(g.mainHours, s.mainHours);
          assert.deepEqual(new Set(g.secondaryTags), new Set(s.secondaryTags));
        }
        assert.equal(await games.get('nao-existe'), undefined);

        // Edição pessoal: nota conclui o jogo; persiste no banco.
        const target = list[0];
        const patched = await service.patch(target.id, { rating: 4.5, actualHours: 7.25 });
        assert.equal(patched.status, 'Finalizado');
        const reread = (await games.get(target.id))!;
        assert.equal(reread.rating, 4.5);
        assert.equal(reread.actualHours, 7.25);
        assert.match(reread.finishedAt!, /^\d{4}-\d{2}-\d{2}$/);

        // Fila: calculada em memória sobre a leitura única das entradas.
        const cold = await service.recommendations();
        const loaded = await inputs.load();
        assert.deepEqual(cold, {
          ...recommendGames(loaded.games, undefined, loaded.pins),
          configVersion: 0,
        });

        // Reordenação: aceita na hora, grava os pins em background; a leitura seguinte reflete.
        const order = cold.items.map((i) => i.game.id);
        const last = order.at(-1)!;
        const moved = await service.reorder(last, 1);
        assert.equal(moved.accepted.fromPosition, order.length);
        await moved.done;
        const after = await service.recommendations();
        assert.equal(after.items[0].game.id, last);
        assert.equal(after.items[0].pinnedPosition, 1);
        // Segundo arraste: o pin anterior muda de índice na tela e é reindexado no banco.
        const second = after.items[5].game.id;
        await (
          await service.reorder(second, 1)
        ).done;
        const twice = await service.recommendations();
        assert.equal(twice.items[0].game.id, second);
        assert.equal(twice.items[1].game.id, last);
        assert.equal(twice.items[1].pinnedPosition, 2);
        const state = await service.manualState();
        assert.deepEqual(
          state.adjustments.map((a) => [a.gameId, a.manualPosition]),
          [
            [last, 2],
            [second, 1],
          ],
        );
        // Mesma gravação repetida (retentativa após sucesso) não duplica o movimento.
        const replay = state.moves.at(-1)!;
        await manual.pin([{ gameId: second, position: 3 }], replay);
        assert.equal((await service.manualState()).moves.length, 2);
        assert.equal((await inputs.load()).pins.find((p) => p.gameId === second)!.position, 1);

        await service.resetManual(second);
        const reset = await service.resetManual(last);
        assert.equal(reset.removed, true);
        assert.deepEqual(
          reset.recommendations.items.map((i) => i.game.id),
          order,
        );
        const final = await service.manualState();
        assert.equal(final.adjustments.length, 0);
        assert.deepEqual(
          final.moves.map((m) => m.kind),
          ['reorder', 'reorder', 'reset', 'reset'],
        );

        // Configuração: sem linha = padrão (versão 0); gravar sobe a versão e invalida a fila.
        const initial = await service.scoringSettings();
        assert.equal(initial.version, 0);
        assert.deepEqual(initial.config, defaultConfig);
        await service.recommendations();
        const off = structuredClone(defaultConfig);
        off.rules.manual = false;
        off.weights.desire = 0.9;
        const saved = await service.saveScoringSettings(off);
        assert.equal(saved.version, 1);
        assert.deepEqual((await settings.get()).config, off);
        assert.equal((await inputs.load()).settings.version, 1);
        const custom = await service.recommendations();
        assert.equal(custom.configVersion, 1);
        assert.deepEqual(custom.weights, off.weights);
        await assert.rejects(service.reorder(last, 1), /desativado/);
        const restored = await service.resetScoringSettings();
        assert.equal(restored.version, 2);
        assert.deepEqual(restored.config, defaultConfig);
      });
    } finally {
      await sql`DELETE FROM app_user WHERE id = ${userId}`;
      const [left] = await sql`
        SELECT (SELECT count(*) FROM library_entry WHERE user_id = ${userId})::int
             + (SELECT count(*) FROM queue_move_event WHERE user_id = ${userId})::int
             + (SELECT count(*) FROM user_score_weights WHERE user_id = ${userId})::int AS n`;
      assert.equal(left.n, 0);
      await closeDb();
    }
  },
);
