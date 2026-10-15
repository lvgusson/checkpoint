import type {
  MetadataCatalog,
  MetadataCategory,
} from '../../../../../../packages/core/src/metadata.ts';
import type { ConfigDriver } from '../types.ts';
import type { Sql } from '../../db.ts';

// Only these source-controlled identifiers reach SQL identifier interpolation.
const tables = {
  genres: 'genre',
  tags: 'tag',
  mechanics: 'mechanic',
  stores: 'store',
  paces: 'ref_pace',
  structures: 'ref_structure',
  platforms: 'ref_platform',
} as const;
export class PgConfigDriver implements ConfigDriver {
  private sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  async list(): Promise<MetadataCatalog> {
    const catalog = {} as MetadataCatalog;
    await Promise.all(
      (Object.keys(tables) as MetadataCategory[]).map(async (category) => {
        const rows = await this.sql<
          { name: string }[]
        >`SELECT name FROM ${this.sql(tables[category])} WHERE name <> '' ORDER BY name`;
        catalog[category] = rows.map((row) => row.name);
      }),
    );
    return catalog;
  }
  async add(category: MetadataCategory, name: string) {
    const table = tables[category];
    await this.sql.begin(async (sql) => {
      // Serialize option writes so normalized names stay unique in the name-keyed tables.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${`checkpoint:config:${table}`}))`;
      if (category === 'paces' || category === 'structures' || category === 'platforms') {
        await sql`INSERT INTO ${sql(table)} (name) SELECT ${name} WHERE NOT EXISTS (SELECT 1 FROM ${sql(table)} WHERE norm_key(name) = norm_key(${name})) ON CONFLICT DO NOTHING`;
      } else
        await sql`INSERT INTO ${sql(table)} (name) VALUES (${name}) ON CONFLICT (key) DO NOTHING`;
    });
  }

  async remove(category: MetadataCategory, name: string): Promise<'removed' | 'missing' | 'used'> {
    try {
      const rows = await this
        .sql`DELETE FROM ${this.sql(tables[category])} WHERE name <> '' AND norm_key(name) = norm_key(${name}) RETURNING name`;
      return rows.length ? 'removed' : 'missing';
    } catch (error) {
      if ((error as { code?: string }).code === '23503') return 'used';
      throw error;
    }
  }
}
