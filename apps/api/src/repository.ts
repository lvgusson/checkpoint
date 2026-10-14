import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Game, GameList } from '../../../packages/core/src/models.ts';
import type { StoredScoringConfig } from './settings-repository.ts';
import type { ManualPin } from './scoring.ts';
import {
  metadataCatalog,
  metadataFields,
  normalizeMetadata,
  type MetadataCatalog,
} from '../../../packages/core/src/metadata.ts';
export interface GameRepository {
  list(): Promise<Game[]>;
  searchByName?(query: string, excludeId?: string): Promise<Game[]>;
  get(id: string): Promise<Game | undefined>;
  save(game: Game): Promise<void>;
  metadataCatalog?(): Promise<MetadataCatalog>;
}

/** Entradas do algoritmo da fila de uma lista. */
export interface QueueInputs {
  list: GameList;
  games: Game[];
  /** Posições fixadas pelo usuário na lista, do pin mais antigo ao mais recente. */
  pins: ManualPin[];
  settings: StoredScoringConfig;
}

/**
 * Lê todas as entradas da fila de uma vez (opcional). Com banco remoto, uma única
 * consulta em vez de quatro; a fila é calculada em memória (~50 ms para ~500 jogos).
 */
export interface QueueInputsReader {
  /**
   * `listId` ausente = lista padrão (a mais antiga). null se a lista não existir/não for do
   * usuário (ou, sem `listId`, se o usuário ainda não tiver listas).
   */
  load(listId?: string): Promise<QueueInputs | null>;
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
      // Jogos fora do seed são os cadastrados no app (lista de desejos).
      for (const g of data) this.games.set(g.id, g);
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
  async metadataCatalog(): Promise<MetadataCatalog> {
    const catalog = structuredClone(metadataCatalog);
    const games = await this.list();
    for (const [category, field] of Object.entries(metadataFields)) {
      const options = catalog[category as keyof MetadataCatalog];
      const known = new Set(options.map(normalizeMetadata));
      for (const game of games) {
        const values = field === 'secondaryTags' ? game.secondaryTags : [game[field]];
        for (const value of values) {
          const key = normalizeMetadata(value);
          if (key && !known.has(key)) {
            options.push(value.trim());
            known.add(key);
          }
        }
      }
    }
    return catalog;
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
