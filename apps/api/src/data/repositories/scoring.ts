import type { ScoringConfig } from '../../../../../packages/core/src/models.ts';
import type { ScoringConfigRepository, StoredScoringConfig } from '../ports.ts';
import { AppError } from '../../shared/errors.ts';
import { storedScoringConfig } from '../../domain/scoring-config.ts';
import type { ScoringDriver, ScoringRecord } from '../drivers/types.ts';
import type { AppUserResolver } from '../ports.ts';
import { toAppError } from './errors.ts';

/** Registro guardado → configuração completa (sem registro = padrão, versão 0). */
export const toStoredScoring = (raw: ScoringRecord | null | undefined): StoredScoringConfig => ({
  config: storedScoringConfig(raw?.weights, raw?.rules, raw?.filters),
  version: raw?.version ?? 0,
  updatedAt: raw?.updatedAt ?? null,
});

export class ScoringConfigRepositoryImpl implements ScoringConfigRepository {
  private driver: ScoringDriver;
  private user: AppUserResolver;
  constructor(driver: ScoringDriver, user: AppUserResolver) {
    this.driver = driver;
    this.user = user;
  }
  async get(listId: string) {
    return toStoredScoring(await this.driver.get(await this.user(), listId));
  }
  async save(listId: string, config: ScoringConfig) {
    const saved = await this.driver.save(await this.user(), listId, config).catch(toAppError);
    if (!saved) throw new AppError('Lista não encontrada', 404);
    return toStoredScoring(saved);
  }
}
