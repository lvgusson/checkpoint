import type { QueueInputsReader } from '../ports.ts';
import type { QueueInputsDriver } from '../drivers/types.ts';
import type { AppUserResolver } from '../ports.ts';
import { toStoredScoring } from './scoring.ts';

export class QueueInputsReaderImpl implements QueueInputsReader {
  private driver: QueueInputsDriver;
  private user: AppUserResolver;
  constructor(driver: QueueInputsDriver, user: AppUserResolver) {
    this.driver = driver;
    this.user = user;
  }
  async load(listId?: string) {
    const record = await this.driver.load(await this.user(), listId);
    if (!record) return null;
    return { ...record, settings: toStoredScoring(record.settings) };
  }
}
