import type { MetadataCategory } from '../../../../../packages/core/src/metadata.ts';
import type { ConfigDriver } from '../drivers/types.ts';
import type { ConfigRepository } from '../ports.ts';
import { AppError } from '../../shared/errors.ts';

export class ConfigRepositoryImpl implements ConfigRepository {
  private driver: ConfigDriver;
  constructor(driver: ConfigDriver) {
    this.driver = driver;
  }
  list() {
    return this.driver.list();
  }
  async add(category: MetadataCategory, name: string) {
    await this.driver.add(category, name);
  }
  async remove(category: MetadataCategory, name: string) {
    const result = await this.driver.remove(category, name);
    if (result === 'used') throw new AppError('A opção está em uso', 409);
    if (result === 'missing') throw new AppError('Opção não encontrada', 404);
  }
}
