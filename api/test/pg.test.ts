// Integração dos repositórios Postgres. Só roda com DATABASE_URL definida:
//   node --env-file=.env --test api/test/pg.test.ts
// Cria um app_user temporário com cópias de algumas entradas do seed e o apaga no fim
// (ON DELETE CASCADE limpa biblioteca, ajustes, eventos, estado e snapshot da fila).
// Só edita campos pessoais (library_entry): o catálogo global (game) não é alterado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, closeDb } from '../src/db.ts';
import { createAppUserResolver, SEED_APP_USER_ID } from '../src/app-user.ts';
import {
  PgGameRepository,
  PgManualAdjustmentRepository,
  PgQueueSnapshotStore,
  PgScoringConfigRepository,
} from '../src/pg-repository.ts';
import { GameService } from '../src/service.ts';
import { runWithContext } from '../src/context.ts';
import { recommendGames, defaultConfig } from '../src/scoring.ts';
import { seedGames } from '../src/seed.ts';

const url = process.env.DATABASE_URL;

test(
  'repositórios Pg: lista, edita, fila com snapshot, reordena e zera',
  { skip: !url && 'DATABASE_URL não definida' },
  async () => {
    const sql = db(url);
    const userId = randomUUID();
    const user = createAppUserResolver(sql);
    const games = new PgGameRepository(sql, user);
    const manual = new PgManualAdjustmentRepository(sql, user);
    const snapshots = new PgQueueSnapshotStore(sql, user);
    const settings = new PgScoringConfigRepository(sql, user);
    const service = new GameService(games, manual, snapshots, settings);
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

        // Fila: 1ª leitura calcula e grava o snapshot; 2ª serve do snapshot (igual).
        const cold = await service.recommendations();
        const [snap] =
          await sql`SELECT inputs_version::text AS v, total FROM queue_snapshot WHERE user_id = ${userId}`;
        assert.equal(snap.total, cold.total);
        const loaded = await snapshots.load();
        assert(loaded.snapshot, 'snapshot deveria estar fresco');
        const warm = await service.recommendations();
        assert.deepEqual(warm, cold);
        assert.deepEqual(warm, recommendGames(loaded.games, undefined, loaded.manual));

        // Reordenação: apply_queue_move invalida o snapshot (inputs_version sobe).
        const last = cold.items.at(-1)!.game.id;
        const moved = await service.reorder(last, 1);
        assert.equal(moved.recommendations.items[0].game.id, last);
        assert((await snapshots.load()).snapshot === null);
        const after = await service.recommendations();
        assert.equal(after.items[0].game.id, last);
        // Regravação sobre itens existentes (DELETE + INSERT na mesma instrução) deu certo.
        const resaved = await snapshots.load();
        assert(resaved.snapshot, 'snapshot regravado deveria estar fresco');
        assert.equal(resaved.snapshot.items[0].gameId, last);
        assert.equal(after.items[0].manualPoints, moved.manualPoints);
        const state = await service.manualState();
        assert.equal(state.adjustments.length, 1);
        assert.equal(state.adjustments[0].gameId, last);
        assert.equal(state.adjustments[0].manualPoints, moved.manualPoints);

        const reset = await service.resetManual(last);
        assert.equal(reset.manualPoints, 0);
        assert.deepEqual(
          reset.recommendations.items.map((i) => i.game.id),
          cold.items.map((i) => i.game.id),
        );
        const final = await service.manualState();
        assert.equal(final.adjustments.length, 0);
        assert.deepEqual(
          final.moves.map((m) => m.kind),
          ['reorder', 'reset'],
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
        const inputs = await snapshots.load();
        assert.equal(inputs.snapshot, null, 'config nova invalida o snapshot');
        assert.equal(inputs.settings.version, 1);
        const custom = await service.recommendations();
        assert.equal(custom.configVersion, 1);
        assert.deepEqual(custom.weights, off.weights);
        await assert.rejects(service.reorder(last, 1), /desativado/);
        const restored = await service.resetScoringSettings();
        assert.equal(restored.version, 2);
        assert.deepEqual(restored.config, defaultConfig);
      });
    } finally {
      // library_entry antes: o trigger de invalidação (por statement) grava em
      // user_queue_state, que não aceita um app_user já apagado na mesma cascata.
      await sql.begin((tx) => [
        tx`DELETE FROM library_entry WHERE user_id = ${userId}`,
        tx`DELETE FROM app_user WHERE id = ${userId}`,
      ]);
      const [left] = await sql`
        SELECT (SELECT count(*) FROM library_entry WHERE user_id = ${userId})::int
             + (SELECT count(*) FROM queue_move_event WHERE user_id = ${userId})::int
             + (SELECT count(*) FROM queue_snapshot WHERE user_id = ${userId})::int
             + (SELECT count(*) FROM user_score_weights WHERE user_id = ${userId})::int AS n`;
      assert.equal(left.n, 0);
      await closeDb();
    }
  },
);
