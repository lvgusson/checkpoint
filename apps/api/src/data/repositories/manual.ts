import type { ManualMove } from '../../../../../packages/core/src/models.ts';
import type { ManualAdjustmentRepository } from '../ports.ts';
import type { ManualPin } from '../../domain/scoring.ts';
import type { PinsDriver } from '../drivers/types.ts';
import type { AppUserResolver } from '../ports.ts';
import { toAppError } from './errors.ts';

export class ManualAdjustmentRepositoryImpl implements ManualAdjustmentRepository {
  private driver: PinsDriver;
  private user: AppUserResolver;
  constructor(driver: PinsDriver, user: AppUserResolver) {
    this.driver = driver;
    this.user = user;
  }
  async list(listId: string) {
    return this.driver.list(await this.user(), listId);
  }
  async pin(listId: string, pins: ManualPin[], move: ManualMove) {
    await this.driver.pin(await this.user(), listId, pins, move).catch(toAppError);
  }
  async remove(listId: string, gameId: string, move: ManualMove) {
    return this.driver.remove(await this.user(), listId, gameId, move);
  }
  async moves(listId: string, gameId?: string) {
    return this.driver.moves(await this.user(), listId, gameId);
  }
}
