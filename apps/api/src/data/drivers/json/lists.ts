// JSON local: listas. Um só usuário: `owner` é ignorado. Sem `path`, só em memória.
import { randomUUID } from 'node:crypto';
import type { GameList } from '../../../../../../packages/core/src/models.ts';
import { DataError, DEFAULT_LIST_NAME, type ListsDriver } from '../types.ts';
import { JsonFile } from './file.ts';

/** Id fixo da lista padrão no modo JSON local: arquivos antigos (sem lista) caem nela. */
export const LOCAL_DEFAULT_LIST_ID = '00000000-0000-4000-8000-0000000000a1';

export class JsonListsDriver implements ListsDriver {
  private lists: GameList[] = [];
  private file: JsonFile;
  private ready: Promise<void>;
  constructor(path: string | null) {
    this.file = new JsonFile(path);
    this.ready = this.load();
  }
  private async load() {
    const data = await this.file.read();
    if (Array.isArray(data)) this.lists = data;
    // Nunca vazio: a lista padrão tem id fixo para os arquivos antigos (sem lista) caírem nela.
    if (!this.lists.length)
      this.lists = [
        {
          id: LOCAL_DEFAULT_LIST_ID,
          name: DEFAULT_LIST_NAME,
          createdAt: new Date(0).toISOString(),
        },
      ];
  }
  /** Equivalente ao índice único (user_id, lower(name)) do Postgres. */
  private taken(name: string, except?: string) {
    const key = name.toLowerCase();
    return this.lists.some((l) => l.id !== except && l.name.toLowerCase() === key);
  }
  async list(_owner: string) {
    await this.ready;
    return structuredClone(this.lists);
  }
  async get(_owner: string, id: string) {
    await this.ready;
    return structuredClone(this.lists.find((l) => l.id === id));
  }
  async create(_owner: string, name: string) {
    await this.ready;
    if (this.taken(name)) throw new DataError('conflict');
    const list = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    this.lists.push(list);
    await this.file.write(this.lists);
    return structuredClone(list);
  }
  async rename(_owner: string, id: string, name: string) {
    await this.ready;
    const list = this.lists.find((l) => l.id === id);
    if (!list) return undefined;
    if (this.taken(name, id)) throw new DataError('conflict');
    list.name = name;
    await this.file.write(this.lists);
    return structuredClone(list);
  }
  async remove(_owner: string, id: string) {
    await this.ready;
    if (!this.lists.some((l) => l.id === id)) return 'missing' as const;
    if (this.lists.length === 1) return 'last' as const;
    this.lists = this.lists.filter((l) => l.id !== id);
    await this.file.write(this.lists);
    return 'removed' as const;
  }
}
