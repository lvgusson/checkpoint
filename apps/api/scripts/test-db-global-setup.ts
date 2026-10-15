// Vitest globalSetup: points the database tests at the checkpoint-test-db container when it is
// healthy and migrated, and says so in one line. Otherwise those tests skip.
import { DB_URL, isHealthy, isMigrated } from './test-db.mjs';

export default function setup() {
  if (process.env.SECURITY_TEST_DATABASE_URL) {
    console.log('db tests: using SECURITY_TEST_DATABASE_URL from the environment');
  } else if (isHealthy() && isMigrated()) {
    process.env.SECURITY_TEST_DATABASE_URL = DB_URL;
    console.log('db tests: using checkpoint-test-db');
  } else {
    console.log('db tests: SKIPPED (run pnpm db:up)');
  }
}
