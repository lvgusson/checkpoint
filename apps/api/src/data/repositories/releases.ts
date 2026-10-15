import {
  ReleaseAlreadyExists,
  VersionTaken,
  type DeployInput,
  type Environment,
  type NewRelease,
} from '../../domain/releases.ts';
import { type ReleaseStore } from '../ports.ts';
import { DataError, type ReleaseDriver } from '../drivers/types.ts';

export class ReleaseRepository implements ReleaseStore {
  private driver: ReleaseDriver;
  constructor(driver: ReleaseDriver) {
    this.driver = driver;
  }
  list(environment: Environment, limit: number, beforeId: number | null) {
    return this.driver.list(environment, limit, beforeId);
  }
  async latest(environment: Environment) {
    return (await this.driver.list(environment, 1, null))[0] ?? null;
  }
  bySha(environment: Environment, gitSha: string, includeRollback = false) {
    return this.driver.bySha(environment, gitSha, includeRollback);
  }
  /** A repeated version asks for a new allocation; a repeated commit returns the existing one. */
  async insert(row: NewRelease) {
    try {
      return await this.driver.insert(row);
    } catch (e) {
      if (e instanceof DataError && e.code === 'conflict') {
        if (e.constraint === 'app_release_env_version_uidx') throw new VersionTaken(row.version);
        if (e.constraint === 'app_release_env_sha_uidx') {
          const existing = await this.bySha(row.environment, row.gitSha);
          if (existing) throw new ReleaseAlreadyExists(existing);
        }
      }
      throw e;
    }
  }
  recordDeploy(releaseId: number, deploy: DeployInput) {
    return this.driver.recordDeploy(releaseId, deploy);
  }
  deployed(deploymentId: string | null, gitSha: string | null, environment: string) {
    return this.driver.deployed(deploymentId, gitSha, environment);
  }
}
