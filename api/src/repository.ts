import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Game } from '../../shared/models.ts';
import type { StoredScoringConfig } from './settings-repository.ts';
import type { ManualPin } from './scoring.ts';
export interface GameRepository {
  list(): Promise<Game[]>;
  get(id: string): Promise<Game | undefined>;
  save(game: Game): Promise<void>;
}

/** Entradas do algoritmo da fila. */
export interface QueueInputs {
  games: Game[];
  /** Posições fixadas pelo usuário, do pin mais antigo ao mais recente. */
  pins: ManualPin[];
  settings: StoredScoringConfig;
}

/**
 * Lê todas as entradas da fila de uma vez (opcional). Com banco remoto, uma única
 * consulta em vez de três; a fila é calculada em memória (~50 ms para ~500 jogos).
 */
export interface QueueInputsReader {
  load(): Promise<QueueInputs>;
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
