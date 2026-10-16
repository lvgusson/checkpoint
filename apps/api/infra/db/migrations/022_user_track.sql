BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.user_track (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_user(id) ON DELETE CASCADE,
  session_id text NOT NULL CHECK (char_length(session_id) BETWEEN 1 AND 64),
  kind text NOT NULL CHECK (kind IN ('page_view', 'click')),
  screen text NOT NULL CHECK (char_length(screen) BETWEEN 1 AND 120),
  element text CHECK (element IS NULL OR char_length(element) <= 120),
  automated boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL
);

-- Per-user history.
CREATE INDEX IF NOT EXISTS user_track_user_occurred_idx
  ON public.user_track (user_id, occurred_at DESC);

-- Per-screen history.
CREATE INDEX IF NOT EXISTS user_track_screen_occurred_idx
  ON public.user_track (screen, occurred_at DESC);

ALTER TABLE public.user_track ENABLE ROW LEVEL SECURITY;

DO $user_track_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.user_track FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.user_track FROM authenticated;
  END IF;
END
$user_track_grants$;

COMMENT ON TABLE public.user_track IS 'Append-only user event log. Element stores a data-testid, never button text.';

CREATE TABLE IF NOT EXISTS public.page_track (
  screen text NOT NULL CHECK (char_length(screen) BETWEEN 1 AND 120),
  day date NOT NULL,
  access_count bigint NOT NULL DEFAULT 0 CHECK (access_count >= 0),
  click_count bigint NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  last_access_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  deleted_by uuid REFERENCES public.app_user(id) ON DELETE SET NULL,
  PRIMARY KEY (screen, day)
);

-- Per-day page history.
CREATE INDEX IF NOT EXISTS page_track_day_idx ON public.page_track (day DESC);

ALTER TABLE public.page_track ENABLE ROW LEVEL SECURITY;

DO $page_track_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.page_track FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.page_track FROM authenticated;
  END IF;
END
$page_track_grants$;

COMMENT ON TABLE public.page_track IS 'Daily access and click counts by screen.';

CREATE OR REPLACE FUNCTION public.purge_user_track(keep_days integer DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $purge$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.user_track
   WHERE occurred_at < now() - make_interval(days => keep_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$purge$;

DO $user_track_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.user_track'::regclass
       AND tgname = 'trg_user_track_audit_touch'
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_user_track_audit_touch
      BEFORE UPDATE ON public.user_track
      FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.page_track'::regclass
       AND tgname = 'trg_page_track_audit_touch'
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_page_track_audit_touch
      BEFORE UPDATE ON public.page_track
      FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();
  END IF;
END
$user_track_trigger$;

DO $user_track_cron$
DECLARE
  cron_schema text;
  job_id bigint;
BEGIN
  SELECT n.nspname INTO cron_schema
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pg_cron';

  IF cron_schema IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = cron_schema AND p.proname = 'schedule'
  ) THEN
    cron_schema := NULL;
  END IF;

  IF cron_schema IS NOT NULL THEN
    EXECUTE format('SELECT jobid FROM %I.job WHERE jobname = $1 LIMIT 1', cron_schema)
      INTO job_id USING 'purge-user-track';
    IF job_id IS NULL THEN
      EXECUTE format('SELECT %I.schedule($1, $2, $3)', cron_schema)
        USING 'purge-user-track', '30 3 * * *',
          'SELECT public.purge_user_track();';
    END IF;
  END IF;
END
$user_track_cron$;

COMMIT;
