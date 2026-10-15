// Serviço de domínio para rastreamento de eventos de navegação e cliques.
import type { TrackBatchRecord, TrackDriver } from '../data/drivers/types.ts';

export class TrackService {
  private driver: TrackDriver;

  constructor(driver: TrackDriver) {
    this.driver = driver;
  }

  async record(batch: TrackBatchRecord): Promise<void> {
    await this.driver.recordBatch(batch);
  }
}
