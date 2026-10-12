import { seedGames } from '../api/src/seed.ts';
import { db, closeDb } from '../api/src/db.ts';
for (const key of [
  'primaryGenre',
  'secondaryTags',
  'pace',
  'mechanic',
  'store',
  'structure',
  'platform',
]) {
  console.log(key, JSON.stringify([...new Set(seedGames.flatMap((game) => game[key]))].sort()));
}
if (process.env.DATABASE_URL) {
  const sql = db();
  for (const table of ['genre', 'tag', 'mechanic', 'store'])
    console.log(table, await sql`SELECT name FROM ${sql(table)} ORDER BY name`);
  console.log(
    'text metadata',
    await sql`SELECT 'pace' AS kind, pace AS value FROM game UNION SELECT 'structure', structure FROM game UNION SELECT 'platform', platform FROM library_entry ORDER BY kind, value`,
  );
  await closeDb();
}
