---
name: tracking
description: User navigation and click tracking via POST /api/v1/track, user_track, and page_track tables.
type: reference
area: backend
---

# Tracking

## Design

The tracking pipeline records user interactions asynchronously.
Tracking never blocks user interaction.
The browser queues events in memory.
The browser flushes the queue every 5 seconds, or on `visibilitychange` and `pagehide` events.
The API responds with HTTP 202 Accepted immediately.
The API processes and records events in the background.

## Endpoint

`POST /api/v1/track` collects interaction batches.

- Authentication: required. Anonymous requests return HTTP 401.
- Rate limit: 30 requests per minute per user. Excess requests return HTTP 429 with `Retry-After: 60`.
- Payload size: at most 16 KiB.
- Batch limit: at most 50 events per batch.
- Screen format: pattern `^/[a-z0-9/:_.-]*$` with maximum length of 120 characters.
- Element format: pattern `^[a-zA-Z0-9_.:-]+$` with maximum length of 120 characters.
- Timestamp validation: clamps `occurredAt` to server time when clock drift exceeds 24 hours.

## Database tables

### `public.user_track`

Append-only event log table.
Columns: `id`, `user_id`, `session_id`, `kind`, `screen`, `element`, `automated`, `occurred_at`, `received_at`, and audit columns.
Row Level Security (RLS) is enabled.
No client policies exist; client connections cannot read or write directly.

### `public.page_track`

Aggregated daily metrics per screen.
Composite primary key: `(screen, day)`.
Columns: `screen`, `day`, `access_count`, `click_count`, `last_access_at`, and audit columns.
The API upserts `page_track` atomically with `user_track` through a common table expression (CTE).

## SQL Queries for Reporting

### Top 10 screens in the last 7 days

```sql
SELECT screen, SUM(access_count) AS total_views, SUM(click_count) AS total_clicks
FROM public.page_track
WHERE day >= (CURRENT_DATE - INTERVAL '7 days')
GROUP BY screen
ORDER BY total_views DESC
LIMIT 10;
```

### Clicks per element for a screen

```sql
SELECT element, COUNT(*) AS click_count
FROM public.user_track
WHERE kind = 'click' AND screen = '/biblioteca' AND element IS NOT NULL
GROUP BY element
ORDER BY click_count DESC;
```

## Privacy & LGPD rule

The system records only the user UUID and the element `data-testid` identifier.
The `user_track` table stores no input values, passwords, text content, or IP addresses.

## Retention

Purge raw events older than 90 days with this command:

```sql
SELECT public.purge_user_track('90 days'::interval);
```

Consolidated counts in `page_track` remain intact after the purge.

## Related

- `[[AI/backend/backend]]`
- `[[AI/frontend/frontend]]`
