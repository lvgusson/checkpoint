import { randomUUID } from 'node:crypto';
import {
  type MetadataCatalog,
  metadataFields,
  normalizeMetadata,
} from '../../../../packages/core/src/metadata.ts';
import {
  type Catalog,
  type Game,
  type GameList,
  type ManualResetResult,
  type ManualMove,
  type ManualState,
  type Recommendations,
  type ReorderAccepted,
  type ScoredGame,
  type ScoringConfig,
  type ScoringSettings,
  Desire,
  GameStatus,
} from '../../../../packages/core/src/models.ts';

export interface ScoredLibraryCacheEntry {
  version: number;
  data: readonly ScoredGame[];
  updatedAt: number;
}
import type { GameRepository } from '../data/ports.ts';
import type { ListRepository } from '../data/ports.ts';
import type { ManualAdjustmentRepository } from '../data/ports.ts';
import type { QueueInputs, QueueInputsReader } from '../data/ports.ts';
import type { ScoringConfigRepository, StoredScoringConfig } from '../data/ports.ts';
import { AppError } from '../shared/errors.ts';
import { normalizeText } from '../domain/text.ts';
import {
  scoreGames,
  recommendGames,
  planMove,
  defaultConfig,
  filterOptions,
  type ManualPin,
  type MovePlan,
} from '../domain/scoring.ts';
import { getContext, runWithContext } from '../shared/context.ts';
import { logger } from '../observability/logger.ts';
import { can, Permission } from '../../../../packages/core/src/authorization.ts';
import { retry, type RetryOptions } from '../shared/retry.ts';
import { parseScoringConfig, scoringFactors } from '../domain/scoring-config.ts';
export const statuses: string[] = Object.values(GameStatus);
export const desires: string[] = Object.values(Desire);
/** Fields stored on the shared `game` row (and its tags), as opposed to the user's library entry. */
const CATALOG_FIELDS = [
  'name',
  'primaryGenre',
  'mechanic',
  'pace',
  'structure',
  'coop',
  'size',
  'mainHours',
  'extraHours',
  'completionistHours',
  'previousEstimatedHours',
  'timeVerification',
  'timeSource',
  'reviewNotes',
  'prerequisiteId',
  'secondaryTags',
] as const;
const catalogChanged = (a: Game, b: Game) =>
  CATALOG_FIELDS.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
/** Parâmetros da listagem de jogos, como chegam da query string. */
interface GameQuery {
  q?: string | null;
  status?: string | null;
  primaryGenre?: string | null;
  store?: string | null;
  sort?: string | null;
  page?: string | null;
  pageSize?: string | null;
}
/** Fila com a config da lista, carimbada com a lista e a versão dessa config. */
const queue = (
  listId: string,
  games: Game[],
  pins: ManualPin[],
  s: StoredScoringConfig,
): Recommendations => ({
  listId,
  ...recommendGames(games, s.config, pins),
  configVersion: s.version,
});
/** Reorder aceito: a resposta sai já; `done` termina quando a gravação acabar (nunca rejeita). */
export interface ReorderTicket {
  accepted: ReorderAccepted;
  done: Promise<void>;
}
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
  /** Retentativa da gravação em background (padrões de retry.ts; testes trocam o sleep). */
  retryOptions: RetryOptions = {};
  /** Cadeia de operações da fila por usuário (movimentos rápidos aplicados em ordem). */
  private chains = new Map<string, Promise<unknown>>();
  /** Cache de biblioteca pontuada em memória por ${userId}:${listId} (máx 50 entradas). */
  readonly scoredCache = new Map<string, ScoredLibraryCacheEntry>();
  static readonly MAX_CACHE_ENTRIES = 50;

  private userKey(): string {
    const ctx = getContext();
    return ctx?.appUserId ?? ctx?.userId ?? '';
  }

  private getCache(key: string): ScoredLibraryCacheEntry | undefined {
    const entry = this.scoredCache.get(key);
    if (!entry) return undefined;
    this.scoredCache.delete(key);
    this.scoredCache.set(key, entry);
    return entry;
  }

  private setCache(key: string, entry: ScoredLibraryCacheEntry): void {
    if (this.scoredCache.has(key)) {
      this.scoredCache.delete(key);
    } else if (this.scoredCache.size >= GameService.MAX_CACHE_ENTRIES) {
      const oldestKey = this.scoredCache.keys().next().value;
      if (oldestKey !== undefined) this.scoredCache.delete(oldestKey);
    }
    this.scoredCache.set(key, entry);
  }

  invalidateUserCache(listId?: string): void {
    const userId = this.userKey();
    if (!userId) {
      if (listId) {
        for (const key of this.scoredCache.keys()) {
          if (key.endsWith(`:${listId}`)) this.scoredCache.delete(key);
        }
      } else {
        this.scoredCache.clear();
      }
      return;
    }
    if (listId) {
      this.scoredCache.delete(`${userId}:${listId}`);
      return;
    }
    const prefix = `${userId}:`;
    for (const key of this.scoredCache.keys()) {
      if (key.startsWith(prefix)) {
        this.scoredCache.delete(key);
      }
    }
  }

  constructor(
    repository: GameRepository,
    manual: ManualAdjustmentRepository,
    inputsReader: QueueInputsReader | null,
    settings: ScoringConfigRepository,
    lists: ListRepository,
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
  /** Jogos + pins + config da lista (numa única leitura quando há `inputsReader`). */
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
    const [games, adjustments, settings] = await Promise.all([
      this.repository.list(),
      this.manual.list(list.id),
      this.settings.get(list.id),
    ]);
    const pins = adjustments.map((a) => ({ gameId: a.gameId, position: a.manualPosition }));
    return { list, games, pins, settings };
  }
  /**
   * Serializa as operações da fila do usuário atual nesta instância. Só vale dentro do
   * processo: entre instâncias serverless, a idempotência por move.id evita duplicar.
   */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const ctx = getContext();
    const key = ctx?.userId ?? ctx?.appUserId ?? '';
    const run = (this.chains.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
    this.chains.set(key, run);
    const cleanup = () => {
      if (this.chains.get(key) === run) this.chains.delete(key);
    };
    run.then(cleanup, cleanup);
    return run;
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
    this.invalidateUserCache(listId);
  }

  // ---------------------------------------------------------------- jogos e configuração
  /** Biblioteca pontuada com a configuração da lista (padrão: a lista padrão). */
  async all(listId?: string): Promise<readonly ScoredGame[]> {
    const list = await this.list(listId);
    const key = `${this.userKey()}:${list.id}`;
    const settings = await this.settings.get(list.id);
    const cached = this.getCache(key);
    if (cached && cached.version === settings.version) {
      return cached.data;
    }
    const games = await this.repository.list();
    const scored = Object.freeze(scoreGames(games, settings.config).games);
    this.setCache(key, {
      version: settings.version,
      data: scored,
      updatedAt: Date.now(),
    });
    return scored;
  }
  /** A biblioteca como está guardada, sem pontuação. */
  library(): Promise<Game[]> {
    return this.repository.list();
  }
  /** Um jogo pontuado. A pontuação depende da biblioteca inteira, então ela é lida toda. */
  async game(id: string, listId?: string) {
    const game = (await this.all(listId)).find((g) => g.id === id);
    if (!game) throw new AppError('Jogo não encontrado', 404);
    return game;
  }
  /** Biblioteca filtrada, ordenada e paginada (parâmetros crus da query string). */
  async browse(query: GameQuery, listId?: string) {
    for (const [k, v] of Object.entries(query)) {
      if (typeof v === 'string' && v.includes('\0')) throw new AppError('Parâmetro inválido: ' + k);
    }
    const page = Math.max(1, Number(query.page) || 1),
      pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 24));

    if (query.sort === 'name' || query.sort === 'desire') {
      const result = await this.repository.browse({
        q: query.q?.trim() || undefined,
        status: query.status?.trim() || undefined,
        primaryGenre: query.primaryGenre?.trim() || undefined,
        store: query.store?.trim() || undefined,
        sort: query.sort,
        page,
        pageSize,
      });
      return {
        items: result.items,
        total: result.total,
        page,
        pageSize,
      };
    }

    const q = normalizeText(query.q ?? '');
    let games = (await this.all(listId)).filter((g) =>
      normalizeText(g.name + ' ' + g.secondaryTags.join(' ')).includes(q),
    );
    for (const field of ['status', 'primaryGenre', 'store'] as const) {
      const v = query[field];
      if (v) games = games.filter((g) => g[field] === v);
    }
    games.sort((a, b) => b.baseScore - a.baseScore);
    return {
      items: games.slice((page - 1) * pageSize, page * pageSize),
      total: games.length,
      page,
      pageSize,
    };
  }
  /** Settings + metadados da tela; as opções dos filtros são contadas sobre os jogos atuais. */
  private async toSettings(listId: string, s: StoredScoringConfig): Promise<ScoringSettings> {
    const games = await this.repository.list();
    return {
      listId,
      ...s,
      defaults: defaultConfig,
      factors: scoringFactors,
      filterOptions: filterOptions(games, s.config),
    };
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
    const saved = await this.settings.save(list.id, config);
    this.invalidateUserCache(list.id);
    return this.toSettings(list.id, saved);
  }
  async resetScoringSettings(listId?: string): Promise<ScoringSettings> {
    const list = await this.list(listId);
    const saved = await this.settings.save(list.id, structuredClone(defaultConfig));
    this.invalidateUserCache(list.id);
    return this.toSettings(list.id, saved);
  }
  async catalog(): Promise<Catalog> {
    const games = await this.repository.list();
    const metadata = await this.repository.metadataCatalog();
    return {
      ...metadata,
      statuses: statuses as Catalog['statuses'],
      desires: desires as Catalog['desires'],
      counts: {
        total: games.length,
        completed: games.filter((g) => g.status === GameStatus.Finished).length,
        playing: games.filter((g) => g.status === GameStatus.Playing).length,
        pending: games.filter((g) => g.status === GameStatus.NotStarted).length,
      },
    };
  }
  /** Entra na cadeia do usuário: espera gravações de reorder pendentes nesta instância. */
  recommendations(listId?: string) {
    return this.serial(async () => {
      const { list, games, pins, settings } = await this.inputs(listId);
      if (games.length > 2000)
        throw new AppError('A biblioteca excede o limite de 2000 jogos para recomendações', 400);
      return queue(list.id, games, pins, settings);
    });
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
   * Arraste na fila da lista. Valida já (o front mostra o jogo onde foi solto sem esperar)
   * e devolve `accepted`; o recálculo e a gravação dos pins seguem em `done`, com até 5
   * tentativas (retry.ts). Erros de validação rejeitam a própria chamada (4xx).
   */
  async reorder(gameId: unknown, toPosition: unknown, listId?: string): Promise<ReorderTicket> {
    if (typeof gameId !== 'string' || !gameId || gameId.includes('\0') || gameId.length > 200)
      throw new AppError('gameId inválido');
    if (
      typeof toPosition !== 'number' ||
      !Number.isInteger(toPosition) ||
      toPosition < 1 ||
      toPosition > 100000
    )
      throw new AppError('toPosition deve ser um inteiro a partir de 1');
    const existing = await this.repository.get(gameId);
    if (!existing) throw new AppError('Jogo não encontrado', 404);
    // Usuário capturado agora: o job roda depois da resposta, ainda como ele.
    const ctx = getContext() ?? {};
    let accept!: (a: ReorderAccepted) => void, refuse!: (e: unknown) => void;
    const accepted = new Promise<ReorderAccepted>((res, rej) => {
      accept = res;
      refuse = rej;
    });
    // Validação entra na cadeia: vê a fila já com os movimentos anteriores gravados.
    const done = this.serial(async () => {
      let plan: MovePlan, id: string;
      try {
        const inputs = await this.inputs(listId);
        id = inputs.list.id;
        plan = this.planReorder(inputs, gameId, toPosition);
      } catch (e) {
        refuse(e);
        return;
      }
      accept({ accepted: true, gameId, fromPosition: plan.fromPosition, toPosition });
      await runWithContext(ctx, () => this.persistMove(id, plan));
    });
    return { accepted: await accepted, done };
  }
  private planReorder({ games, pins, settings }: QueueInputs, gameId: string, to: number) {
    if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
    if (!settings.config.rules.manual)
      throw new AppError('O ajuste manual está desativado nas configurações', 409);
    const current = recommendGames(games, settings.config, pins);
    if (!current.items.some((i) => i.game.id === gameId))
      throw new AppError('O jogo não está na fila', 409);
    try {
      return planMove(current, gameId, to);
    } catch (e) {
      if (e instanceof RangeError) throw new AppError(e.message);
      throw e;
    }
  }
  /** Grava os pins com retentativa; falha final só é registrada (a resposta já saiu). */
  private async persistMove(listId: string, plan: MovePlan): Promise<void> {
    const move: ManualMove = {
      id: randomUUID(),
      gameId: plan.gameId,
      kind: 'reorder',
      fromPosition: plan.fromPosition,
      toPosition: plan.toPosition,
      createdAt: new Date().toISOString(),
    };
    try {
      await retry(
        async (attempt) => {
          // Depois de uma falha o estado pode ter mudado: refaz o plano (mesmo move.id,
          // então uma gravação que chegou a acontecer não é aplicada de novo).
          const p =
            attempt === 1
              ? plan
              : this.planReorder(await this.inputs(listId), plan.gameId, plan.toPosition);
          await this.manual.pin(listId, p.pins, move);
        },
        {
          ...this.retryOptions,
          shouldRetry: (e) => !(e instanceof AppError),
          onRetry: (e, attempt, delay) =>
            logger.warn('reorder.persist_retry', {
              gameId: plan.gameId,
              attempt,
              retryInMs: delay,
              error: e,
            }),
        },
      );
    } catch (e) {
      logger.error('reorder.persist_failed', {
        gameId: plan.gameId,
        toPosition: plan.toPosition,
        error: e,
      });
    }
  }
  /** Solta o pin de um jogo (volta à posição do algoritmo) e devolve a fila recalculada. */
  resetManual(gameId: string, listId?: string): Promise<ManualResetResult> {
    return this.serial(async () => {
      const { list, games, pins, settings } = await this.inputs(listId);
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      const before = queue(list.id, games, pins, settings);
      const rest = pins.filter((p) => p.gameId !== gameId);
      const removed =
        rest.length !== pins.length &&
        (await this.manual.remove(list.id, gameId, {
          id: randomUUID(),
          gameId,
          kind: 'reset',
          fromPosition: before.items.find((i) => i.game.id === gameId)?.position ?? null,
          toPosition: null,
          createdAt: new Date().toISOString(),
        }));
      return {
        gameId,
        removed,
        recommendations: removed ? queue(list.id, games, rest, settings) : before,
      };
    });
  }
  /** Name search is bounded and delegated to the repository. */
  async searchGames(query: string, excludeId?: string) {
    if (query.includes('\0') || (excludeId && excludeId.includes('\0')))
      throw new AppError('Termo de busca inválido');
    const text = query.trim();
    if (text.length < 3) return [];
    if (text.length > 120) throw new AppError('Busque usando até 120 caracteres');
    const scored = await this.all();
    const byId = new Map(scored.map((g) => [g.id, g]));
    const found = await this.repository.searchByName(text, excludeId);
    return found.map((g) => byId.get(g.id) ?? g);
  }
  async purchase(id: string) {
    return this.serial(async () => {
      const game = await this.repository.get(id);
      if (!game) throw new AppError('Jogo não encontrado', 404);
      if (game.purchasedAt && game.status !== GameStatus.Wishlist) return this.game(id);
      if (game.status !== GameStatus.Wishlist)
        throw new AppError('O jogo não está na lista de desejos', 409);
      await this.repository.save({
        ...game,
        status: GameStatus.NotStarted,
        purchasedAt: game.purchasedAt ?? new Date().toISOString(),
      });
      this.invalidateUserCache();
      return this.game(id);
    });
  }

  async patch(id: string, body: Record<string, unknown>) {
    return this.serial(async () => {
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
      const controlledFields = Object.fromEntries(
        Object.entries(metadataFields).map(([catalogKey, field]) => [field, catalogKey]),
      ) as Record<string, keyof MetadataCatalog>;
      const metadata = await this.repository.metadataCatalog();
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
          if (
            typeof value !== 'string' ||
            value.includes('\0') ||
            value.length > 10000 ||
            (key === 'name' && !value.trim())
          )
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
            value.some(
              (t) => typeof t !== 'string' || !t.trim() || t.includes('\0') || t.length > 80,
            )
          )
            throw new AppError('Use até três tags secundárias');
        } else if (key === 'prerequisiteId') {
          if (
            value !== null &&
            (typeof value !== 'string' ||
              !value ||
              value.includes('\0') ||
              value.length > 200 ||
              value === id)
          )
            throw new AppError('Predecessor inválido');
          if (typeof value === 'string') {
            const seen = new Set([id]);
            let predecessorId: string | null = value;
            while (predecessorId) {
              if (seen.has(predecessorId))
                throw new AppError('O predecessor criaria uma sequência circular');
              seen.add(predecessorId);
              const predecessor = await this.repository.get(predecessorId);
              if (!predecessor) {
                if (predecessorId === value) throw new AppError('Predecessor não encontrado', 404);
                break;
              }
              predecessorId = predecessor.prerequisiteId;
            }
          }
        } else throw new AppError('Campo não editável: ' + key);
        const catalogKey = controlledFields[key];
        if (catalogKey) {
          const canonical = (entry: string) =>
            metadata[catalogKey].find(
              (option) => normalizeMetadata(option) === normalizeMetadata(entry),
            );
          if (key === 'secondaryTags') {
            const tags = (value as string[]).map(canonical);
            if (tags.some((tag) => !tag) || new Set(tags).size !== tags.length)
              throw new AppError('Tags secundárias inválidas');
            Object.assign(next, { secondaryTags: tags });
          } else {
            const entry = (value as string).trim();
            const option = entry ? canonical(entry) : '';
            if (option === undefined) throw new AppError('Opção inválida: ' + key);
            Object.assign(next, { [key]: option });
          }
        } else Object.assign(next, { [key]: value });
      }
      if (
        Object.hasOwn(body, 'rating') &&
        next.rating !== null &&
        next.rating !== old.rating &&
        body.autoFinish !== false
      ) {
        next.status = GameStatus.Finished;
        next.finishedAt ??= new Date().toISOString().slice(0, 10);
      }
      if (body.status === GameStatus.Finished)
        next.finishedAt ??= new Date().toISOString().slice(0, 10);
      if (
        next.status === GameStatus.Playing &&
        old.status !== GameStatus.Playing &&
        !next.startedAt
      )
        next.startedAt = new Date().toISOString().slice(0, 10);
      if (
        body.status &&
        body.status !== GameStatus.Finished &&
        !Object.hasOwn(body, 'finishedAt') &&
        next.status !== GameStatus.Finished
      )
        next.finishedAt = null;
      // Work data (game rows and tags) is shared by every library; only admins may change it.
      if (!can(getContext()?.role, Permission.CatalogUpdate) && catalogChanged(old, next))
        throw new AppError('Somente administradores editam dados do catálogo', 403);
      next.updatedAt = new Date().toISOString();
      await this.repository.save(next);
      this.invalidateUserCache();
      // Leaving the upcoming queue clears stale manual positions in every list.
      if (
        (next.status === GameStatus.Finished || next.status === GameStatus.Playing) &&
        old.status !== next.status
      )
        await Promise.all(
          (await this.lists.list()).map((list) =>
            this.manual.remove(list.id, id, {
              id: randomUUID(),
              gameId: id,
              kind: 'reset',
              fromPosition: null,
              toPosition: null,
              createdAt: next.updatedAt!,
            }),
          ),
        );
      return this.game(id);
    });
  }
}
