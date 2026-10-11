import { randomUUID } from 'node:crypto';
import type {
  Catalog,
  Game,
  ManualResetResult,
  ManualMove,
  ManualState,
  ReorderAccepted,
  ScoringConfig,
  ScoringSettings,
} from '../../shared/models.ts';
import type { GameRepository, QueueInputs, QueueInputsReader } from './repository.ts';
import {
  LocalManualAdjustmentRepository,
  toPins,
  type ManualAdjustmentRepository,
} from './manual-repository.ts';
import {
  scoreGames,
  recommendGames,
  planMove,
  defaultConfig,
  type ManualPin,
  type MovePlan,
} from './scoring.ts';
import { getContext, runWithContext } from './context.ts';
import { retry, type RetryOptions } from './retry.ts';
import { parseScoringConfig, scoringFactors } from './scoring-config.ts';
import {
  LocalScoringConfigRepository,
  type ScoringConfigRepository,
  type StoredScoringConfig,
} from './settings-repository.ts';
export const statuses = ['Não iniciado', 'Jogando', 'Abandonado', 'Finalizado'];
export const desires = ['Imediata', 'Muito Alta', 'Alta', 'Média', 'Baixa', 'Muito Baixa'];
export class AppError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
/** Fila com a config do usuário, carimbada com a versão dessa config. */
const queue = (games: Game[], pins: ManualPin[], s: StoredScoringConfig) => ({
  ...recommendGames(games, s.config, pins),
  configVersion: s.version,
});
/** Reorder aceito: a resposta sai já; `done` termina quando a gravação acabar (nunca rejeita). */
export interface ReorderTicket {
  accepted: ReorderAccepted;
  done: Promise<void>;
}
export class GameService {
  repository: GameRepository;
  manual: ManualAdjustmentRepository;
  inputsReader: QueueInputsReader | null;
  settings: ScoringConfigRepository;
  /** Retentativa da gravação em background (padrões de retry.ts; testes trocam o sleep). */
  retryOptions: RetryOptions = {};
  /** Cadeia de operações da fila por usuário (movimentos rápidos aplicados em ordem). */
  private chains = new Map<string, Promise<unknown>>();
  constructor(
    repository: GameRepository,
    manual: ManualAdjustmentRepository = new LocalManualAdjustmentRepository(),
    inputsReader: QueueInputsReader | null = null,
    settings: ScoringConfigRepository = new LocalScoringConfigRepository(),
  ) {
    this.repository = repository;
    this.manual = manual;
    this.inputsReader = inputsReader;
    this.settings = settings;
  }
  /** Jogos + pins + config (numa única leitura quando há `inputsReader`). */
  private async inputs(): Promise<QueueInputs> {
    if (this.inputsReader) return this.inputsReader.load();
    const [games, adjustments, settings] = await Promise.all([
      this.repository.list(),
      this.manual.list(),
      this.settings.get(),
    ]);
    return { games, pins: toPins(adjustments), settings };
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
  async all() {
    const [games, settings] = await Promise.all([this.repository.list(), this.settings.get()]);
    return scoreGames(games, settings.config).games;
  }
  private toSettings(s: StoredScoringConfig): ScoringSettings {
    return { ...s, defaults: defaultConfig, factors: scoringFactors };
  }
  async scoringSettings(): Promise<ScoringSettings> {
    return this.toSettings(await this.settings.get());
  }
  /** Valida e grava pesos + regras; a fila é invalidada pela nova versão das entradas. */
  async saveScoringSettings(body: unknown): Promise<ScoringSettings> {
    let config: ScoringConfig;
    try {
      config = parseScoringConfig(body);
    } catch (e) {
      if (e instanceof RangeError) throw new AppError(e.message);
      throw e;
    }
    return this.toSettings(await this.settings.save(config));
  }
  async resetScoringSettings(): Promise<ScoringSettings> {
    return this.toSettings(await this.settings.save(structuredClone(defaultConfig)));
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
  /** Entra na cadeia do usuário: espera gravações de reorder pendentes nesta instância. */
  recommendations() {
    return this.serial(async () => {
      const { games, pins, settings } = await this.inputs();
      return queue(games, pins, settings);
    });
  }
  async manualState(): Promise<ManualState> {
    return {
      adjustments: await this.manual.list(),
      moves: await this.manual.moves(),
    };
  }
  /**
   * Arraste na fila. Valida já (o front mostra o jogo onde foi solto sem esperar) e
   * devolve `accepted`; o recálculo e a gravação dos pins seguem em `done`, com até 5
   * tentativas (retry.ts). Erros de validação rejeitam a própria chamada (4xx).
   */
  async reorder(gameId: unknown, toPosition: unknown): Promise<ReorderTicket> {
    if (typeof gameId !== 'string' || !gameId || gameId.length > 200)
      throw new AppError('gameId inválido');
    if (
      typeof toPosition !== 'number' ||
      !Number.isInteger(toPosition) ||
      toPosition < 1 ||
      toPosition > 100000
    )
      throw new AppError('toPosition deve ser um inteiro a partir de 1');
    // Usuário capturado agora: o job roda depois da resposta, ainda como ele.
    const ctx = getContext() ?? {};
    let accept!: (a: ReorderAccepted) => void, refuse!: (e: unknown) => void;
    const accepted = new Promise<ReorderAccepted>((res, rej) => {
      accept = res;
      refuse = rej;
    });
    // Validação entra na cadeia: vê a fila já com os movimentos anteriores gravados.
    const done = this.serial(async () => {
      let plan: MovePlan;
      try {
        plan = this.planReorder(await this.inputs(), gameId, toPosition);
      } catch (e) {
        refuse(e);
        return;
      }
      accept({ accepted: true, gameId, fromPosition: plan.fromPosition, toPosition });
      await runWithContext(ctx, () => this.persistMove(plan));
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
  private async persistMove(plan: MovePlan): Promise<void> {
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
              : this.planReorder(await this.inputs(), plan.gameId, plan.toPosition);
          await this.manual.pin(p.pins, move);
        },
        {
          ...this.retryOptions,
          shouldRetry: (e) => !(e instanceof AppError),
          onRetry: (e, attempt, delay) =>
            console.warn(`[reorder] tentativa ${attempt} falhou; nova em ${delay} ms`, e),
        },
      );
    } catch (e) {
      console.error(`[reorder] ${plan.gameId} → ${plan.toPosition} não foi gravado`, e);
    }
  }
  /** Solta o pin de um jogo (volta à posição do algoritmo) e devolve a fila recalculada. */
  resetManual(gameId: string): Promise<ManualResetResult> {
    return this.serial(async () => {
      const { games, pins, settings } = await this.inputs();
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      const before = queue(games, pins, settings);
      const rest = pins.filter((p) => p.gameId !== gameId);
      const removed =
        rest.length !== pins.length &&
        (await this.manual.remove(gameId, {
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
        recommendations: removed ? queue(games, rest, settings) : before,
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
    // Finalizado sai da fila: a posição fixa perde o sentido (e não volta se reabrir).
    if (next.status === 'Finalizado' && old.status !== 'Finalizado')
      await this.manual.remove(id, {
        id: randomUUID(),
        gameId: id,
        kind: 'reset',
        fromPosition: null,
        toPosition: null,
        createdAt: next.updatedAt,
      });
    return (await this.all()).find((g) => g.id === id)!;
  }
}
