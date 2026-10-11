import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Game, Recommendations } from '../../shared/models.ts';
import { scoreGames } from './scoring.ts';
export interface GameRepository {
  list(): Promise<Game[]>;
  get(id: string): Promise<Game | undefined>;
  save(game: Game): Promise<void>;
}

/** Fila calculada e persistida (sem o card do jogo, que é juntado na leitura). */
export interface StoredQueue {
  total: number;
  estimatedHours: number;
  timeFactor: number;
  weights: Recommendations['weights'];
  excluded: Recommendations['excluded'];
  items: {
    gameId: string;
    position: number;
    score: number;
    manualPoints: number;
    cumulativeHours: number;
    reasons: string[];
    adjustments: { label: string; points: number }[];
  }[];
}

/** Entradas do algoritmo lidas de forma consistente (uma única leitura). */
export interface QueueInputs {
  /** Versão das entradas (opaca) no momento da leitura. */
  version: string;
  games: Game[];
  /** gameId -> pontos manuais (só ≠ 0). */
  manual: Record<string, number>;
  /** Snapshot da fila, apenas se estiver fresco para `version`. */
  snapshot: StoredQueue | null;
}

/** Cache persistente da fila (opcional): evita rodar o algoritmo O(n²) a cada leitura. */
export interface QueueSnapshotStore {
  load(): Promise<QueueInputs>;
  save(version: string, queue: Recommendations): Promise<void>;
}

/** Junta os cards (pontuados agora) às posições do snapshot; null se faltar algum jogo. */
export function hydrateQueue(stored: StoredQueue, games: Game[]): Recommendations | null {
  const scored = new Map(scoreGames(games, stored.weights).games.map((g) => [g.id, g]));
  const items: Recommendations['items'] = [];
  for (const i of stored.items) {
    const game = scored.get(i.gameId);
    if (!game) return null;
    items.push({
      position: i.position,
      game,
      score: i.score,
      cumulativeHours: i.cumulativeHours,
      reasons: i.reasons,
      adjustments: i.adjustments,
      manualPoints: i.manualPoints,
    });
  }
  return {
    items,
    total: stored.total,
    estimatedHours: stored.estimatedHours,
    timeFactor: stored.timeFactor,
    weights: stored.weights,
    excluded: stored.excluded,
  };
}

export class LocalGameRepository implements GameRepository {
  private games: Map<string, Game>;
  private ready: Promise<void>;
  private writing = Promise.resolve();
  constructor(seed: Game[], privatePath: string) {
    this.games = new Map(structuredClone(seed).map((g) => [g.id, g]));
    this.path = privatePath;
    this.ready = this.load();
  }
  private path: string;
  private async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      for (const g of data) if (this.games.has(g.id)) this.games.set(g.id, g);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async list() {
    await this.ready;
    return structuredClone([...this.games.values()]);
  }
  async get(id: string) {
    await this.ready;
    return structuredClone(this.games.get(id));
  }
  async save(game: Game) {
    await this.ready;
    this.games.set(game.id, structuredClone(game));
    const snapshot = JSON.stringify([...this.games.values()], null, 2);
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(this.path + '.tmp', snapshot);
        await rename(this.path + '.tmp', this.path);
      });
    await this.writing;
  }
}
