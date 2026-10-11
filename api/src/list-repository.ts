import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { GameList } from '../../shared/models.ts';
import { AppError } from './service.ts';

/** Nome da lista criada automaticamente no primeiro acesso (e na migração dos dados antigos). */
export const DEFAULT_LIST_NAME = 'Principal';
/** Id fixo da lista padrão no modo JSON local: arquivos antigos (sem lista) caem nela. */
export const LOCAL_DEFAULT_LIST_ID = '00000000-0000-4000-8000-0000000000a1';

/**
 * Listas do usuário (só o nome é da lista; todos os jogos aparecem em todas).
 * `list()` garante ao menos uma lista e devolve a mais antiga primeiro (= lista padrão).
 */
export interface ListRepository {
  list(): Promise<GameList[]>;
  get(id: string): Promise<GameList | undefined>;
  /** Lança AppError 409 se já existir uma lista com o mesmo nome (sem diferenciar maiúsculas). */
  create(name: string): Promise<GameList>;
  rename(id: string, name: string): Promise<GameList | undefined>;
  /** 'last' = não apaga a única lista do usuário. */
  remove(id: string): Promise<'removed' | 'missing' | 'last'>;
}

export const duplicateListName = () => new AppError('Já existe uma lista com esse nome', 409);

/** Adaptador local em JSON (dev/testes). Sem `path`, mantém só em memória. */
export class LocalListRepository implements ListRepository {
  private lists: GameList[] = [];
  private ready: Promise<void>;
  private path: string | null;
  constructor(path: string | null = null) {
    this.path = path;
    this.ready = this.load();
  }
  private async load() {
    if (this.path) {
      try {
        const data = JSON.parse(await readFile(this.path, 'utf8'));
        if (Array.isArray(data)) this.lists = data;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    if (!this.lists.length)
      this.lists = [
        {
          id: LOCAL_DEFAULT_LIST_ID,
          name: DEFAULT_LIST_NAME,
          createdAt: new Date(0).toISOString(),
        },
      ];
  }
  private async persist() {
    if (!this.path) return;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path + '.tmp', JSON.stringify(this.lists, null, 2));
    await rename(this.path + '.tmp', this.path);
  }
  private taken(name: string, except?: string) {
    const key = name.toLowerCase();
    return this.lists.some((l) => l.id !== except && l.name.toLowerCase() === key);
  }
  async list() {
    await this.ready;
    return structuredClone(this.lists);
  }
  async get(id: string) {
    await this.ready;
    return structuredClone(this.lists.find((l) => l.id === id));
  }
  async create(name: string) {
    await this.ready;
    if (this.taken(name)) throw duplicateListName();
    const list = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.lists.push(list);
    await this.persist();
    return structuredClone(list);
  }
  async rename(id: string, name: string) {
    await this.ready;
    const list = this.lists.find((l) => l.id === id);
    if (!list) return undefined;
    if (this.taken(name, id)) throw duplicateListName();
    list.name = name;
    await this.persist();
    return structuredClone(list);
  }
  async remove(id: string) {
    await this.ready;
    if (!this.lists.some((l) => l.id === id)) return 'missing' as const;
    if (this.lists.length === 1) return 'last' as const;
    this.lists = this.lists.filter((l) => l.id !== id);
    await this.persist();
    return 'removed' as const;
  }
}
