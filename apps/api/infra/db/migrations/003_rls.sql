-- =============================================================================
-- 003_rls: Row Level Security (Supabase) + grants
--
-- * Catálogo (game, vocabulários, metadados, mídia): leitura pública (anon e
--   authenticated); escrita só pelo backend (service_role / dono das tabelas,
--   que ignoram RLS).
-- * Dados pessoais (biblioteca, pesos, reordenação, fila): apenas do próprio
--   usuário, resolvido por current_app_user_id() a partir de auth.uid().
-- * Em Postgres puro (sem Supabase) criamos shims mínimos: schema auth com
--   auth.uid() lendo o claim do JWT (mesma semântica do Supabase) e os roles
--   anon/authenticated (NOLOGIN). Em Supabase nada disso é recriado.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------- shims (PG puro)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
DO $do$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
      SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                             current_setting('request.jwt.claims', true)::jsonb ->> 'sub'), '')::uuid
    $f$;
  END IF;
END
$do$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;

-- FK opcional app_user.auth_user_id -> auth.users (só existe no Supabase)
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_auth_user_fk') THEN
    ALTER TABLE public.app_user
      ADD CONSTRAINT app_user_auth_user_fk FOREIGN KEY (auth_user_id)
      REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------- usuário corrente
-- STABLE + SECURITY DEFINER (lê app_user sem depender da policy). Nas policies
-- usar "(SELECT current_app_user_id())" para o planner avaliar uma vez (InitPlan)
-- em vez de por linha.
CREATE OR REPLACE FUNCTION public.current_app_user_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.app_user WHERE auth_user_id = auth.uid()
$$;

-- Cria/garante o app_user do usuário logado (chamar após o login via RPC)
CREATE OR REPLACE FUNCTION public.ensure_app_user(p_display_name text DEFAULT '')
RETURNS public.app_user
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u public.app_user; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT * INTO u FROM public.app_user WHERE auth_user_id = uid;
  IF NOT FOUND THEN
    INSERT INTO public.app_user (id, auth_user_id, display_name)
    VALUES (uid, uid, coalesce(p_display_name, ''))
    ON CONFLICT (id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
      WHERE public.app_user.auth_user_id IS NULL
    RETURNING * INTO u;
  END IF;
  RETURN u;
END $$;

-- Funções internas não devem ser RPC públicas
REVOKE ALL ON FUNCTION public.bump_queue_version(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_game_tags(bigint)  FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.bump_queue_version(uuid[]) FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.refresh_game_tags(bigint)  FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.reset_queue_adjustments(uuid, bigint) FROM anon;
  REVOKE ALL ON FUNCTION public.apply_queue_move(uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) FROM anon;
END $$;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_app_user(text) TO authenticated;

-- ---------------------------------------------------------------- grants
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.ref_status, public.ref_desire, public.genre, public.mechanic, public.tag, public.store,
                public.game, public.game_tag, public.game_metadata, public.game_screenshot,
                public.game_trailer, public.game_metadata_source
  TO anon, authenticated;
GRANT SELECT, UPDATE ON public.app_user TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_entry, public.user_score_weights,
                public.queue_manual_adjustment TO authenticated;
GRANT SELECT, INSERT ON public.queue_move_event TO authenticated;
GRANT SELECT ON public.user_queue_state, public.queue_snapshot, public.queue_snapshot_item TO authenticated;
GRANT SELECT ON public.library_card, public.queue_freshness TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Views respeitam a RLS de quem consulta (PG15+). Em PG14 a opção não existe.
DO $$ BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    ALTER VIEW public.library_card    SET (security_invoker = on);
    ALTER VIEW public.queue_freshness SET (security_invoker = on);
  END IF;
END $$;

-- ---------------------------------------------------------------- RLS: catálogo (leitura pública)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ref_status','ref_desire','genre','mechanic','tag','store','game','game_tag',
                           'game_metadata','game_screenshot','game_trailer','game_metadata_source']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_read', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------- RLS: dados por usuário
ALTER TABLE public.app_user ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_user_self_read   ON public.app_user;
DROP POLICY IF EXISTS app_user_self_update ON public.app_user;
CREATE POLICY app_user_self_read ON public.app_user FOR SELECT TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));
CREATE POLICY app_user_self_update ON public.app_user FOR UPDATE TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- Tabelas com leitura+escrita do dono
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['library_entry','user_score_weights','queue_manual_adjustment']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR ALL TO authenticated
                      USING (user_id = (SELECT public.current_app_user_id()))
                      WITH CHECK (user_id = (SELECT public.current_app_user_id()))$p$, t || '_owner', t);
  END LOOP;
END $$;

-- Auditoria: lê e insere (sem UPDATE/DELETE: histórico imutável para o cliente)
ALTER TABLE public.queue_move_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_move_event_owner_read   ON public.queue_move_event;
DROP POLICY IF EXISTS queue_move_event_owner_insert ON public.queue_move_event;
CREATE POLICY queue_move_event_owner_read ON public.queue_move_event FOR SELECT TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()));
CREATE POLICY queue_move_event_owner_insert ON public.queue_move_event FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));

-- Fila materializada: o cliente só lê; quem escreve é o backend (service_role)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_queue_state','queue_snapshot','queue_snapshot_item']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_read', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (user_id = (SELECT public.current_app_user_id()))$p$, t || '_owner_read', t);
  END LOOP;
END $$;

-- Tabelas internas sem acesso de cliente
ALTER TABLE public.schema_migration ENABLE ROW LEVEL SECURITY;

INSERT INTO schema_migration (version) VALUES ('003_rls') ON CONFLICT DO NOTHING;

COMMIT;
