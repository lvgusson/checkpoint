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
const CACHE_MS = 10_000;

export class PgConfigDriver implements ConfigDriver {
  private sql: Sql;
  // Options change rarely. Writes on this instance clear it; other instances catch up in CACHE_MS.
  private cached: { value: MetadataCatalog; expires: number } | null = null;
  constructor(sql: Sql) {
    this.sql = sql;
  }
  /**
   * One statement, one round trip. Seven parallel queries exceeded the 5-slot pool and stalled
   * behind the Supavisor transaction pooler (see AI/backend/infrastructure.md). Order and the
   * `name <> ''` filter match the former per-table queries.
   */
  async list(): Promise<MetadataCatalog> {
    if (this.cached && this.cached.expires > Date.now()) return structuredClone(this.cached.value);
    const { sql } = this;
    const list = (category: MetadataCategory) =>
      sql`(SELECT coalesce(json_agg(name ORDER BY name), '[]') FROM ${sql(tables[category])} WHERE name <> '')`;
    const [row] = await sql<{ catalog: MetadataCatalog }[]>`
      SELECT json_build_object(
        'genres', ${list('genres')}, 'tags', ${list('tags')}, 'mechanics', ${list('mechanics')},
        'stores', ${list('stores')}, 'paces', ${list('paces')},
        'structures', ${list('structures')}, 'platforms', ${list('platforms')}
      ) AS catalog`;
    this.cached = { value: row.catalog, expires: Date.now() + CACHE_MS };
    return structuredClone(row.catalog);
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
    this.cached = null;
  }

  async remove(category: MetadataCategory, name: string): Promise<'removed' | 'missing' | 'used'> {
    try {
      const rows = await this
        .sql`DELETE FROM ${this.sql(tables[category])} WHERE name <> '' AND norm_key(name) = norm_key(${name}) RETURNING name`;
      this.cached = null;
      return rows.length ? 'removed' : 'missing';
    } catch (error) {
      if ((error as { code?: string }).code === '23503') return 'used';
      throw error;
    }
  }
}
