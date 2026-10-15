-- Add audit fields without changing existing columns or assigning historical actors.
-- schema_migration and views are outside the application table scope.
-- app_release.created_by stays text: release scripts already write textual actor names.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $audit$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_release',
    'app_release_deploy',
    'app_user',
    'game',
    'game_list',
    'game_metadata',
    'game_metadata_source',
    'game_price',
    'game_screenshot',
    'game_tag',
    'game_trailer',
    'genre',
    'library_entry',
    'logs',
    'mechanic',
    'queue_manual_adjustment',
    'queue_move_event',
    'ref_desire',
    'ref_pace',
    'ref_platform',
    'ref_status',
    'ref_structure',
    'store',
    'tag',
    'user_score_weights'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
         ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.app_user(id),
         ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.app_user(id),
         ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.app_user(id)',
      table_name
    );

    -- Keep existing timestamp handlers, including the game and library entry write handlers.
    IF NOT EXISTS (
      SELECT 1
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE t.tgrelid = format('public.%I', table_name)::regclass
         AND NOT t.tgisinternal
         AND t.tgenabled <> 'D'
         AND (t.tgtype::integer & 19) = 19
         AND n.nspname = 'public'
         AND p.proname IN (
           'trg_touch_updated_at', 'trg_game_before_write', 'trg_library_entry_fill'
         )
    ) THEN
      EXECUTE format(
        'CREATE OR REPLACE TRIGGER %I BEFORE UPDATE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at()',
        'trg_' || table_name || '_audit_touch', table_name
      );
    END IF;
  END LOOP;
END
$audit$;

COMMIT;
