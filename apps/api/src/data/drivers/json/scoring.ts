// JSON local: configuração do algoritmo por lista, `{ lists: { [listId]: registro } }`.
// Arquivo antigo (uma config só) vira a config da lista padrão. Um só usuário: `owner` é ignorado.
import type { ScoringConfig } from '../../../../../../packages/core/src/models.ts';
import type { ScoringDriver, ScoringRecord } from '../types.ts';
import { JsonFile } from './file.ts';
import { LOCAL_DEFAULT_LIST_ID } from './lists.ts';

interface StoredEntry {
  config: { weights: unknown; rules: unknown; filters: unknown };
  version: number;
  updatedAt: string | null;
}

/** Tolera arquivo antigo (sem `filters`). */
const fromJson = (data: Record<string, unknown> | null | undefined): StoredEntry => {
  const config = data?.config as
    { weights?: unknown; rules?: unknown; filters?: unknown } | undefined;
  return {
    config: { weights: config?.weights, rules: config?.rules, filters: config?.filters },
    version: Number.isInteger(data?.version) ? (data!.version as number) : 0,
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
  };
};
const toRecord = (e: StoredEntry): ScoringRecord => ({
  ...e.config,
  version: e.version,
  updatedAt: e.updatedAt,
});

export class JsonScoringDriver implements ScoringDriver {
  private byList = new Map<string, StoredEntry>();
  private file: JsonFile;
  private ready: Promise<void>;
  constructor(path: string | null) {
    this.file = new JsonFile(path);
    this.ready = this.load();
  }
  private async load() {
    const data = (await this.file.read()) as Record<string, unknown> | undefined;
    if (!data) return;
    if (data.lists && typeof data.lists === 'object')
      for (const [id, s] of Object.entries(data.lists))
        this.byList.set(id, fromJson(s as Record<string, unknown>));
    else this.byList.set(LOCAL_DEFAULT_LIST_ID, fromJson(data));
  }
  async get(_owner: string, listId: string) {
    await this.ready;
    const entry = this.byList.get(listId);
    return entry && structuredClone(toRecord(entry));
  }
  async save(_owner: string, listId: string, config: ScoringConfig) {
    await this.ready;
    const next: StoredEntry = {
      config: structuredClone(config),
      version: (this.byList.get(listId)?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.byList.set(listId, next);
    await this.file.write({ lists: Object.fromEntries(this.byList) });
    return structuredClone(toRecord(next));
  }
}
