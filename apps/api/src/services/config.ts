import {
  metadataFields,
  normalizeMetadata,
  type MetadataCategory,
} from '../../../../packages/core/src/metadata.ts';
import { can, Permission } from '../../../../packages/core/src/authorization.ts';
import type { ConfigRepository } from '../data/ports.ts';
import { getContext } from '../shared/context.ts';
import { AppError } from '../shared/errors.ts';

export class ConfigService {
  private repository: ConfigRepository;
  constructor(repository: ConfigRepository) {
    this.repository = repository;
  }
  list() {
    return this.repository.list();
  }
  private input(category: string, body: unknown): [MetadataCategory, string] {
    if (!can(getContext()?.role, Permission.CatalogUpdate))
      throw new AppError('Acesso negado', 403);
    if (!Object.hasOwn(metadataFields, category)) throw new AppError('Categoria inválida');
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new AppError('Objeto obrigatório');
    const data = body as Record<string, unknown>;
    if (Object.keys(data).length !== 1 || typeof data.name !== 'string')
      throw new AppError('Informe somente name');
    const name = data.name.trim();
    const max = category === 'tags' || category === 'stores' ? 80 : 120;
    if (
      !normalizeMetadata(name) ||
      name.length > max ||
      [...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      throw new AppError('Nome inválido');
    return [category as MetadataCategory, name];
  }
  async add(category: string, body: unknown) {
    const [key, name] = this.input(category, body);
    const catalog = await this.repository.list();
    if (catalog[key].some((value) => normalizeMetadata(value) === normalizeMetadata(name)))
      throw new AppError('Opção já existe', 409);
    await this.repository.add(key, name);
    return this.repository.list();
  }
  async remove(category: string, body: unknown) {
    const [key, name] = this.input(category, body);
    await this.repository.remove(key, name);
    return this.repository.list();
  }
}
