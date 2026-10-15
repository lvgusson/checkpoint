import type { ListRepository } from '../ports.ts';
import { AppError } from '../../shared/errors.ts';
import { DataError, DEFAULT_LIST_NAME, type ListsDriver } from '../drivers/types.ts';
import type { AppUserResolver } from '../ports.ts';
import { toAppError } from './errors.ts';

/** Nome repetido → 409; o resto segue a tradução comum. */
function listError(e: unknown): never {
  if (e instanceof DataError && e.code === 'conflict')
    throw new AppError('Já existe uma lista com esse nome', 409);
  return toAppError(e);
}

export class ListRepositoryImpl implements ListRepository {
  private driver: ListsDriver;
  private user: AppUserResolver;
  constructor(driver: ListsDriver, user: AppUserResolver) {
    this.driver = driver;
    this.user = user;
  }
  async list() {
    const owner = await this.user();
    const lists = await this.driver.list(owner);
    if (lists.length) return lists;
    // Primeiro acesso: cria a lista padrão. Se outra requisição criou antes, relê.
    try {
      return [await this.driver.create(owner, DEFAULT_LIST_NAME)];
    } catch (e) {
      if (e instanceof DataError && e.code === 'conflict') return this.driver.list(owner);
      throw e;
    }
  }
  async get(id: string) {
    return this.driver.get(await this.user(), id);
  }
  async create(name: string) {
    return this.driver.create(await this.user(), name).catch(listError);
  }
  async rename(id: string, name: string) {
    return this.driver.rename(await this.user(), id, name).catch(listError);
  }
  async remove(id: string) {
    return this.driver.remove(await this.user(), id);
  }
}
