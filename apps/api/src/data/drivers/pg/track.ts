// Postgres: registro de eventos de navegação e cliques (user_track e page_track).
import type { Sql } from '../../db.ts';
import type { TrackBatchRecord, TrackDriver } from '../types.ts';

export class PgTrackDriver implements TrackDriver {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async recordBatch(batch: TrackBatchRecord): Promise<void> {
    if (batch.events.length === 0) return;
    const kinds = batch.events.map((e) => e.kind);
    const screens = batch.events.map((e) => e.screen);
    const elements = batch.events.map((e) => e.element ?? null);
    const occurredAts = batch.events.map((e) =>
      e.occurredAt instanceof Date
        ? e.occurredAt.toISOString()
        : new Date(e.occurredAt).toISOString(),
    );

    await this.sql`
      WITH inserted AS (
        INSERT INTO public.user_track (
          user_id,
          session_id,
          kind,
          screen,
          element,
          automated,
          occurred_at,
          created_by,
          updated_by
        )
        SELECT
          ${batch.userId}::uuid,
          ${batch.sessionId}::text,
          t.kind,
          t.screen,
          t.element,
          ${batch.automated}::boolean,
          t.occurred_at,
          ${batch.userId}::uuid,
          ${batch.userId}::uuid
        FROM unnest(
          ${kinds}::text[],
          ${screens}::text[],
          ${elements}::text[],
          ${occurredAts}::timestamptz[]
        ) AS t(kind, screen, element, occurred_at)
        RETURNING screen, kind, (occurred_at AT TIME ZONE 'UTC')::date AS day, occurred_at
      )
      INSERT INTO public.page_track (
        screen,
        day,
        access_count,
        click_count,
        last_access_at,
        created_by,
        updated_by
      )
      SELECT
        screen,
        day,
        count(*) FILTER (WHERE kind = 'page_view') AS access_count,
        count(*) FILTER (WHERE kind = 'click') AS click_count,
        max(occurred_at) FILTER (WHERE kind = 'page_view') AS last_access_at,
        ${batch.userId}::uuid AS created_by,
        ${batch.userId}::uuid AS updated_by
      FROM inserted
      GROUP BY screen, day
      ON CONFLICT (screen, day) DO UPDATE SET
        access_count = page_track.access_count + EXCLUDED.access_count,
        click_count = page_track.click_count + EXCLUDED.click_count,
        last_access_at = GREATEST(page_track.last_access_at, EXCLUDED.last_access_at),
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    `;
  }
}
