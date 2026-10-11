import { randomUUID } from 'node:crypto';
import type {
  Catalog,
  Game,
  GameList,
  ManualResetResult,
  ManualState,
  Recommendations,
  ReorderResult,
  ScoringConfig,
  ScoringSettings,
} from '../../shared/models.ts';
import type { GameRepository, QueueInputs, QueueInputsReader } from './repository.ts';
import { LocalListRepository, type ListRepository } from './list-repository.ts';
import {
  LocalManualAdjustmentRepository,
  type ManualAdjustmentRepository,
} from './manual-repository.ts';
import { scoreGames, recommendGames, solveManualPoints, defaultConfig } from './scoring.ts';
import { parseScoringConfig, scoringFactors } from './scoring-config.ts';
import {
  LocalScoringConfigRepository,
  type ScoringConfigRepository,
  type StoredScoringConfig,
} from './settings-repository.ts';
export const statuses = ['Não iniciado', 'Jogando', 'Abandonado', 'Finalizado'];
export const desires = ['Muito Alta', 'Alta', 'Média', 'Baixa', 'Muito Baixa'];
export class AppError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
/** Fila com a config da lista, carimbada com a lista e a versão dessa config. */
const queue = (
  listId: string,
  games: Game[],
  manual: Record<string, number>,
  s: StoredScoringConfig,
): Recommendations => ({
  listId,
  ...recommendGames(games, s.config, manual),
  configVersion: s.version,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const listNotFound = () => new AppError('Lista não encontrada', 404);
/** Nome de lista: texto de 1 a 60 caracteres (espaços nas pontas são removidos). */
function listName(body: Record<string, unknown>): string {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60)
    throw new AppError('O nome da lista deve ter de 1 a 60 caracteres');
  return name;
}
/**
 * Regras de negócio sobre jogos e listas. Métodos da fila/configuração recebem `listId`
 * opcional: ausente = lista padrão do usuário (a mais antiga), usada pelas rotas sem lista.
 */
export class GameService {
  repository: GameRepository;
  manual: ManualAdjustmentRepository;
  inputsReader: QueueInputsReader | null;
  settings: ScoringConfigRepository;
  lists: ListRepository;
  private queueLock: Promise<unknown> = Promise.resolve();
  constructor(
    repository: GameRepository,
    manual: ManualAdjustmentRepository = new LocalManualAdjustmentRepository(),
    inputsReader: QueueInputsReader | null = null,
    settings: ScoringConfigRepository = new LocalScoringConfigRepository(),
    lists: ListRepository = new LocalListRepository(),
  ) {
    this.repository = repository;
    this.manual = manual;
    this.inputsReader = inputsReader;
    this.settings = settings;
    this.lists = lists;
  }
  /** Lista do usuário (404 se não existir ou for de outro usuário); ausente = lista padrão. */
  private async list(listId?: string): Promise<GameList> {
    if (listId === undefined) return (await this.lists.list())[0];
    const list = UUID.test(listId) ? await this.lists.get(listId) : undefined;
    if (!list) throw listNotFound();
    return list;
  }
  /** Jogos + pontos manuais + config da lista (numa única leitura quando há `inputsReader`). */
  private async inputs(listId?: string): Promise<QueueInputs> {
    if (listId !== undefined && !UUID.test(listId)) throw listNotFound();
    if (this.inputsReader) {
      const inputs = await this.inputsReader.load(listId);
      if (inputs) return inputs;
      if (listId !== undefined) throw listNotFound();
      await this.lists.list(); // usuário sem listas: cria a padrão e relê
      return (await this.inputsReader.load())!;
    }
    const list = await this.list(listId);
    const [games, manual, settings] = await Promise.all([
      this.repository.list(),
      this.manualPoints(list.id),
      this.settings.get(list.id),
    ]);
    return { list, games, manual, settings };
  }
  /** Serializa operações de leitura-cálculo-gravação dos ajustes manuais. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queueLock.catch(() => {}).then(fn);
    this.queueLock = run;
    return run;
  }
  private async manualPoints(listId: string): Promise<Record<string, number>> {
    return Object.fromEntries(
      (await this.manual.list(listId)).map((a) => [a.gameId, a.manualPoints]),
    );
  }

  // ---------------------------------------------------------------- listas
  allLists(): Promise<GameList[]> {
    return this.lists.list();
  }
  async createList(body: Record<string, unknown>): Promise<GameList> {
    return this.lists.create(listName(body));
  }
  async renameList(listId: string, body: Record<string, unknown>): Promise<GameList> {
    const name = listName(body);
    const list = UUID.test(listId) ? await this.lists.rename(listId, name) : undefined;
    if (!list) throw listNotFound();
    return list;
  }
  async deleteList(listId: string): Promise<void> {
    const result = UUID.test(listId) ? await this.lists.remove(listId) : 'missing';
    if (result === 'missing') throw listNotFound();
    if (result === 'last') throw new AppError('Não é possível apagar a única lista', 409);
  }

  // ---------------------------------------------------------------- jogos e configuração
  /** Biblioteca pontuada com a configuração da lista (padrão: a lista padrão). */
  async all(listId?: string) {
    const list = await this.list(listId);
    const [games, settings] = await Promise.all([
      this.repository.list(),
      this.settings.get(list.id),
    ]);
    return scoreGames(games, settings.config).games;
  }
  private toSettings(listId: string, s: StoredScoringConfig): ScoringSettings {
    return { listId, ...s, defaults: defaultConfig, factors: scoringFactors };
  }
  async scoringSettings(listId?: string): Promise<ScoringSettings> {
    const list = await this.list(listId);
    return this.toSettings(list.id, await this.settings.get(list.id));
  }
  /** Valida e grava pesos + regras da lista; a fila dela usa a nova versão. */
  async saveScoringSettings(body: unknown, listId?: string): Promise<ScoringSettings> {
    let config: ScoringConfig;
    try {
      config = parseScoringConfig(body);
    } catch (e) {
      if (e instanceof RangeError) throw new AppError(e.message);
      throw e;
    }
    const list = await this.list(listId);
    return this.toSettings(list.id, await this.settings.save(list.id, config));
  }
  async resetScoringSettings(listId?: string): Promise<ScoringSettings> {
    const list = await this.list(listId);
    return this.toSettings(
      list.id,
      await this.settings.save(list.id, structuredClone(defaultConfig)),
    );
  }
  async catalog(): Promise<Catalog> {
    const games = await this.repository.list();
    const unique = (values: string[]) =>
      [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      genres: unique(games.map((g) => g.primaryGenre)),
      stores: unique(games.map((g) => g.store)),
      tags: unique(games.flatMap((g) => g.secondaryTags)),
      statuses: statuses as Catalog['statuses'],
      desires: desires as Catalog['desires'],
      counts: {
        total: games.length,
        completed: games.filter((g) => g.status === 'Finalizado').length,
        playing: games.filter((g) => g.status === 'Jogando').length,
        pending: games.filter((g) => g.status === 'Não iniciado').length,
      },
    };
  }
  async recommendations(listId?: string) {
    const { list, games, manual, settings } = await this.inputs(listId);
    return queue(list.id, games, manual, settings);
  }
  async manualState(listId?: string): Promise<ManualState> {
    const list = await this.list(listId);
    const [adjustments, moves] = await Promise.all([
      this.manual.list(list.id),
      this.manual.moves(list.id),
    ]);
    return { adjustments, moves };
  }
  /**
   * Move um jogo da fila da lista para `toPosition` convertendo o gesto em pontos flat
   * acumulados ("Ajuste manual"), verificados contra o algoritmo real.
   */
  reorder(gameId: unknown, toPosition: unknown, listId?: string): Promise<ReorderResult> {
    if (typeof gameId !== 'string' || !gameId || gameId.length > 200)
      throw new AppError('gameId inválido');
    if (
      typeof toPosition !== 'number' ||
      !Number.isInteger(toPosition) ||
      toPosition < 1 ||
      toPosition > 100000
    )
      throw new AppError('toPosition deve ser um inteiro a partir de 1');
    return this.exclusive(async () => {
      const { list, games, manual, settings } = await this.inputs(listId);
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      if (!settings.config.rules.manual)
        throw new AppError('O ajuste manual está desativado nas configurações', 409);
      let solution;
      try {
        solution = solveManualPoints(games, gameId, toPosition, manual, settings.config);
      } catch (e) {
        if (e instanceof RangeError) throw new AppError('O jogo não está na fila', 409);
        throw e;
      }
      const now = new Date().toISOString();
      const nextManual: Record<string, number> = { ...manual };
      if (solution.pointsDelta !== 0) {
        if (solution.manualPoints === 0) delete nextManual[gameId];
        else nextManual[gameId] = solution.manualPoints;
        const move = {
          id: randomUUID(),
          gameId,
          kind: 'reorder' as const,
          fromPosition: solution.fromPosition,
          toPosition: solution.requestedPosition,
          effectivePosition: solution.effectivePosition,
          pointsDelta: solution.pointsDelta,
          manualPointsAfter: solution.manualPoints,
          createdAt: now,
        };
        if (solution.manualPoints === 0) await this.manual.remove(list.id, gameId, move);
        else
          await this.manual.save(
            list.id,
            {
              gameId,
              manualPoints: solution.manualPoints,
              manualPosition: solution.requestedPosition,
              updatedAt: now,
            },
            move,
          );
      }
      return {
        gameId,
        fromPosition: solution.fromPosition,
        requestedPosition: solution.requestedPosition,
        effectivePosition: solution.effectivePosition,
        exact: solution.exact,
        pointsDelta: solution.pointsDelta,
        manualPoints: solution.manualPoints,
        recommendations: queue(list.id, games, nextManual, settings),
      };
    });
  }
  /** Zera o ajuste manual de um jogo na lista e devolve a fila recalculada. */
  resetManual(gameId: string, listId?: string): Promise<ManualResetResult> {
    return this.exclusive(async () => {
      const { list, games, manual, settings } = await this.inputs(listId);
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      const previous = manual[gameId] ?? 0;
      if (previous !== 0) {
        const before = queue(list.id, games, manual, settings);
        const next = { ...manual };
        delete next[gameId];
        const after = queue(list.id, games, next, settings);
        const pos = (q: typeof before) =>
          q.items.find((i) => i.game.id === gameId)?.position ?? null;
        await this.manual.remove(list.id, gameId, {
          id: randomUUID(),
          gameId,
          kind: 'reset',
          fromPosition: pos(before),
          toPosition: null,
          effectivePosition: pos(after),
          pointsDelta: -previous,
          manualPointsAfter: 0,
          createdAt: new Date().toISOString(),
        });
        return {
          gameId,
          pointsDelta: -previous,
          manualPoints: 0,
          recommendations: after,
        };
      }
      return {
        gameId,
        pointsDelta: 0,
        manualPoints: 0,
        recommendations: queue(list.id, games, manual, settings),
      };
    });
  }
  async patch(id: string, body: Record<string, unknown>) {
    const old = await this.repository.get(id);
    if (!old) throw new AppError('Jogo não encontrado', 404);
    const next = structuredClone(old);
    const numbers = [
      'actualHours',
      'mainHours',
      'extraHours',
      'completionistHours',
      'previousEstimatedHours',
    ];
    const strings = [
      'name',
      'primaryGenre',
      'store',
      'platform',
      'pace',
      'structure',
      'notes',
      'size',
      'timeVerification',
      'timeSource',
      'reviewNotes',
      'coop',
      'mechanic',
    ];
    const dates = ['startedAt', 'finishedAt'];
    for (const [key, value] of Object.entries(body)) {
      if (key === 'autoFinish') {
        if (typeof value !== 'boolean') throw new AppError('autoFinish precisa ser booleano');
        continue;
      }
      if (numbers.includes(key)) {
        if (
          value !== null &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000)
        )
          throw new AppError('Horas inválidas');
      } else if (strings.includes(key)) {
        if (typeof value !== 'string' || value.length > 10000 || (key === 'name' && !value.trim()))
          throw new AppError('Texto inválido: ' + key);
      } else if (dates.includes(key)) {
        if (
          value !== null &&
          (typeof value !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
            !Number.isFinite(Date.parse(value)) ||
            new Date(value).toISOString().slice(0, 10) !== value)
        )
          throw new AppError('Data inválida');
      } else if (key === 'status') {
        if (!statuses.includes(value as string)) throw new AppError('Status inválido');
      } else if (key === 'desire') {
        if (!desires.includes(value as string)) throw new AppError('Vontade inválida');
      } else if (key === 'rating') {
        if (
          value !== null &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 5)
        )
          throw new AppError('A nota deve ser de 1 a 5');
      } else if (key === 'secondaryTags') {
        if (
          !Array.isArray(value) ||
          value.length > 3 ||
          value.some((t) => typeof t !== 'string' || !t.trim() || t.length > 80)
        )
          throw new AppError('Use até três tags secundárias');
      } else if (key === 'prerequisiteId') {
        if (value !== null && (typeof value !== 'string' || value === id))
          throw new AppError('Predecessor inválido');
      } else throw new AppError('Campo não editável: ' + key);
      Object.assign(next, { [key]: value });
    }
    if (
      Object.hasOwn(body, 'rating') &&
      next.rating !== null &&
      next.rating !== old.rating &&
      body.autoFinish !== false
    ) {
      next.status = 'Finalizado';
      next.finishedAt ??= new Date().toISOString().slice(0, 10);
    }
    if (body.status === 'Finalizado') next.finishedAt ??= new Date().toISOString().slice(0, 10);
    if (
      body.status &&
      body.status !== 'Finalizado' &&
      !Object.hasOwn(body, 'finishedAt') &&
      next.status !== 'Finalizado'
    )
      next.finishedAt = null;
    next.updatedAt = new Date().toISOString();
    await this.repository.save(next);
    return (await this.all()).find((g) => g.id === id)!;
  }
}
