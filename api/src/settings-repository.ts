import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ScoringConfig } from '../../shared/models.ts';
import { storedScoringConfig } from './scoring-config.ts';

/** Configuração do algoritmo do usuário + versão (sobe a cada gravação; 0 = padrão). */
export interface StoredScoringConfig {
  config: ScoringConfig;
  version: number;
  updatedAt: string | null;
}

export interface ScoringConfigRepository {
  get(): Promise<StoredScoringConfig>;
  /** Grava (já validada) e devolve o registro novo, com a versão incrementada. */
  save(config: ScoringConfig): Promise<StoredScoringConfig>;
}

/** Adaptador local em JSON (dev/testes). Sem `path`, mantém só em memória. */
export class LocalScoringConfigRepository implements ScoringConfigRepository {
  private current: StoredScoringConfig = {
    config: storedScoringConfig(null, null, null),
    version: 0,
    updatedAt: null,
  };
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
      this.current = {
        config: storedScoringConfig(data.config?.weights, data.config?.rules, data.config?.filters),
        version: Number.isInteger(data.version) ? data.version : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  async get() {
    await this.ready;
    return structuredClone(this.current);
  }
  async save(config: ScoringConfig) {
    await this.ready;
    this.current = {
      config: structuredClone(config),
      version: this.current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    if (this.path) {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path + '.tmp', JSON.stringify(this.current, null, 2));
      await rename(this.path + '.tmp', this.path);
    }
    return structuredClone(this.current);
  }
}
