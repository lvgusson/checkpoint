import { randomUUID } from 'node:crypto';
import type {
  Catalog,
  Game,
  ManualResetResult,
  ManualState,
  ReorderResult,
} from '../../shared/models.ts';
import { hydrateQueue, type GameRepository, type QueueSnapshotStore } from './repository.ts';
import {
  LocalManualAdjustmentRepository,
  type ManualAdjustmentRepository,
} from './manual-repository.ts';
import { scoreGames, recommendGames, solveManualPoints, defaultWeights } from './scoring.ts';
export const statuses = ['Não iniciado', 'Jogando', 'Abandonado', 'Finalizado'];
export const desires = ['Muito Alta', 'Alta', 'Média', 'Baixa', 'Muito Baixa'];
export class AppError extends Error {
  code: number;
  constructor(message: string, code = 400) {
    super(message);
    this.code = code;
  }
}
export class GameService {
  repository: GameRepository;
  manual: ManualAdjustmentRepository;
  snapshots: QueueSnapshotStore | null;
  private queueLock: Promise<unknown> = Promise.resolve();
  constructor(
    repository: GameRepository,
    manual: ManualAdjustmentRepository = new LocalManualAdjustmentRepository(),
    snapshots: QueueSnapshotStore | null = null,
  ) {
    this.repository = repository;
    this.manual = manual;
    this.snapshots = snapshots;
  }
  /** Jogos + pontos manuais; com snapshot store, numa única leitura consistente. */
  private async inputs(): Promise<{ games: Game[]; manual: Record<string, number> }> {
    if (this.snapshots) return this.snapshots.load();
    const [games, manual] = await Promise.all([this.repository.list(), this.manualPoints()]);
    return { games, manual };
  }
  /** Serializa operações de leitura-cálculo-gravação dos ajustes manuais. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queueLock.catch(() => {}).then(fn);
    this.queueLock = run;
    return run;
  }
  private async manualPoints(): Promise<Record<string, number>> {
    return Object.fromEntries((await this.manual.list()).map((a) => [a.gameId, a.manualPoints]));
  }
  async all() {
    return scoreGames(await this.repository.list()).games;
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
  /**
   * Fila. Com snapshot store: serve o snapshot quando fresco (mesma versão das entradas);
   * senão recalcula e regrava. Sem store: sempre recalcula.
   */
  async recommendations() {
    if (!this.snapshots) {
      const { games, manual } = await this.inputs();
      return recommendGames(games, defaultWeights, manual);
    }
    const input = await this.snapshots.load();
    const cached = input.snapshot && hydrateQueue(input.snapshot, input.games);
    if (cached) return cached;
    const queue = recommendGames(input.games, defaultWeights, input.manual);
    await this.snapshots.save(input.version, queue);
    return queue;
  }
  async manualState(): Promise<ManualState> {
    return {
      adjustments: await this.manual.list(),
      moves: await this.manual.moves(),
    };
  }
  /**
   * Move um jogo da fila para `toPosition` convertendo o gesto em pontos flat
   * acumulados ("Ajuste manual"), verificados contra o algoritmo real.
   */
  reorder(gameId: unknown, toPosition: unknown): Promise<ReorderResult> {
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
      const { games, manual } = await this.inputs();
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      let solution;
      try {
        solution = solveManualPoints(games, gameId, toPosition, manual, defaultWeights);
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
        if (solution.manualPoints === 0) await this.manual.remove(gameId, move);
        else
          await this.manual.save(
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
        recommendations: recommendGames(games, defaultWeights, nextManual),
      };
    });
  }
  /** Zera o ajuste manual de um jogo e devolve a fila recalculada. */
  resetManual(gameId: string): Promise<ManualResetResult> {
    return this.exclusive(async () => {
      const { games, manual } = await this.inputs();
      if (!games.some((g) => g.id === gameId)) throw new AppError('Jogo não encontrado', 404);
      const previous = manual[gameId] ?? 0;
      if (previous !== 0) {
        const before = recommendGames(games, defaultWeights, manual);
        const next = { ...manual };
        delete next[gameId];
        const after = recommendGames(games, defaultWeights, next);
        const pos = (q: typeof before) =>
          q.items.find((i) => i.game.id === gameId)?.position ?? null;
        await this.manual.remove(gameId, {
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
        recommendations: recommendGames(games, defaultWeights, manual),
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
