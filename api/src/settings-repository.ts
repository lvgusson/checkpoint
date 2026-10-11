import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ScoringConfig } from '../../shared/models.ts';
import { storedScoringConfig } from './scoring-config.ts';
import { LOCAL_DEFAULT_LIST_ID } from './list-repository.ts';

/** Configuração do algoritmo de uma lista + versão (sobe a cada gravação; 0 = padrão). */
export interface StoredScoringConfig {
  config: ScoringConfig;
  version: number;
  updatedAt: string | null;
}

export interface ScoringConfigRepository {
  get(listId: string): Promise<StoredScoringConfig>;
  /** Grava (já validada) e devolve o registro novo, com a versão incrementada. */
  save(listId: string, config: ScoringConfig): Promise<StoredScoringConfig>;
}

const initial = (): StoredScoringConfig => ({
  config: storedScoringConfig(null, null, null),
  version: 0,
  updatedAt: null,
});

/** Tolera arquivo antigo (sem `filters`). */
const fromJson = (data: Record<string, unknown> | null | undefined): StoredScoringConfig => {
  const config = data?.config as
    { weights?: unknown; rules?: unknown; filters?: unknown } | undefined;
  return {
    config: storedScoringConfig(config?.weights, config?.rules, config?.filters),
    version: Number.isInteger(data?.version) ? (data!.version as number) : 0,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  };
};

/**
 * Adaptador local em JSON (dev/testes), `{ lists: { [listId]: StoredScoringConfig } }`.
 * Arquivo antigo (uma config só) vira a config da lista padrão. Sem `path`, só em memória.
 */
export class LocalScoringConfigRepository implements ScoringConfigRepository {
  private byList = new Map<string, StoredScoringConfig>();
  private ready: Promise<void>;
  private path: string | null;
  constructor(path: string | null = null) {
    this.path = path;
    this.ready = this.load();
  }
  private async load() {
    if (!this.path) return;
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      if (data?.lists && typeof data.lists === 'object')
        for (const [id, s] of Object.entries(data.lists))
          this.byList.set(id, fromJson(s as Record<string, unknown>));
      else this.byList.set(LOCAL_DEFAULT_LIST_ID, fromJson(data));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async get(listId: string) {
    await this.ready;
    return structuredClone(this.byList.get(listId) ?? initial());
  }
  async save(listId: string, config: ScoringConfig) {
    await this.ready;
    const next = {
      config: structuredClone(config),
      version: (this.byList.get(listId)?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.byList.set(listId, next);
    if (this.path) {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(
        this.path + '.tmp',
        JSON.stringify({ lists: Object.fromEntries(this.byList) }, null, 2),
      );
      await rename(this.path + '.tmp', this.path);
    }
    return structuredClone(next);
  }
}
