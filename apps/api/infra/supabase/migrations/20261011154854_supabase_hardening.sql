-- =============================================================================
-- Ajustes específicos do Supabase (não existe equivalente em db/migrations).
--
-- 1) search_path fixo nas funções que não tinham (advisor
--    "function_search_path_mutable"). As funções IMMUTABLE usadas em colunas
--    geradas/índices têm corpo totalmente qualificado, então search_path = ''.
-- 2) Privilégios mínimos: no Supabase, tabelas criadas em public recebem ALL
--    para anon/authenticated por default privileges. A RLS já bloqueia, mas
--    reduzimos os grants ao que 003_rls declara (defesa em profundidade).
-- =============================================================================

-- ---------------------------------------------------------------- 1) search_path
ALTER FUNCTION public.immutable_unaccent(text) SET search_path = '';
ALTER FUNCTION public.norm_key(text)           SET search_path = '';
ALTER FUNCTION public.slugify(text)            SET search_path = '';

ALTER FUNCTION public.trg_touch_updated_at()   SET search_path = public, extensions;
ALTER FUNCTION public.trg_game_before_write()  SET search_path = public, extensions;
ALTER FUNCTION public.trg_library_entry_fill() SET search_path = public, extensions;
ALTER FUNCTION public.apply_queue_move(uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint)
  SET search_path = public, extensions;
ALTER FUNCTION public.reset_queue_adjustments(uuid, bigint) SET search_path = public, extensions;

-- ---------------------------------------------------------------- 2) grants mínimos
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- (mesmos grants de 003_rls)
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

-- Funções de mutação da fila: só usuários logados (a RLS restringe ao próprio user_id)
REVOKE ALL ON FUNCTION public.apply_queue_move(uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_queue_adjustments(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_queue_move(uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_queue_adjustments(uuid, bigint) TO authenticated, service_role;

-- ensure_app_user é SECURITY DEFINER: nunca para anon
REVOKE ALL ON FUNCTION public.ensure_app_user(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_app_user(text) TO authenticated;
