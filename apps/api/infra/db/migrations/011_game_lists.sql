-- =============================================================================
-- Múltiplas listas por usuário.
--
-- Uma lista é só um nome: todas as listas mostram TODOS os jogos da biblioteca do usuário,
-- mas a configuração do algoritmo (user_score_weights) e a reordenação manual
-- (queue_manual_adjustment + queue_move_event) passam a ser POR LISTA.
--
-- - game_list(id, user_id, name): nome único por usuário sem diferenciar maiúsculas.
-- - FKs compostas (user_id, list_id) → game_list(user_id, id) garantem que a lista é do
--   mesmo usuário da linha (a API conecta direto, sem RLS) e apagam em cascata a config,
--   os ajustes e o histórico da lista.
-- - Dados existentes: cada app_user ganha a lista "Principal" e tudo o que já existia
--   (pesos/regras, ajustes, histórico) é atribuído a ela.
-- - "Ao menos uma lista por usuário" é regra da API (não apaga a última; cria a padrão no
--   primeiro acesso), não do banco: um trigger bloqueando o DELETE impediria a cascata
--   de app_user.
-- =============================================================================

-- ---------------------------------------------------------------- game_list
CREATE TABLE IF NOT EXISTS game_list (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- alvo das FKs compostas; também atende WHERE user_id = ? (FK de app_user e listagem)
  CONSTRAINT game_list_user_id_uq UNIQUE (user_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS game_list_user_name_uq ON game_list (user_id, lower(name));

CREATE OR REPLACE TRIGGER trg_game_list_touch BEFORE UPDATE ON game_list
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

-- Lista padrão para quem já existe (a mais antiga de cada usuário é a "padrão" da API).
INSERT INTO game_list (user_id, name)
SELECT u.id, 'Principal' FROM app_user u
 WHERE NOT EXISTS (SELECT 1 FROM game_list l WHERE l.user_id = u.id);

-- Lista padrão = a mais antiga (mesma regra da API). View temporária: some com a sessão.
CREATE TEMP VIEW first_list AS
SELECT DISTINCT ON (user_id) user_id, id AS list_id
  FROM game_list ORDER BY user_id, created_at, id;

-- ---------------------------------------------------------------- user_score_weights: 1 linha por lista
ALTER TABLE user_score_weights ADD COLUMN IF NOT EXISTS list_id uuid;
UPDATE user_score_weights w SET list_id = f.list_id
  FROM first_list f WHERE f.user_id = w.user_id AND w.list_id IS NULL;
ALTER TABLE user_score_weights ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE user_score_weights DROP CONSTRAINT user_score_weights_pkey;
ALTER TABLE user_score_weights ADD CONSTRAINT user_score_weights_pkey PRIMARY KEY (list_id);
ALTER TABLE user_score_weights ADD CONSTRAINT user_score_weights_list_fk
  FOREIGN KEY (user_id, list_id) REFERENCES game_list (user_id, id) ON DELETE CASCADE;
-- a PK antiga (user_id) atendia a FK user_id → app_user
CREATE INDEX IF NOT EXISTS user_score_weights_user_idx ON user_score_weights (user_id);

-- ---------------------------------------------------------------- queue_manual_adjustment: por (lista, jogo)
ALTER TABLE queue_manual_adjustment ADD COLUMN IF NOT EXISTS list_id uuid;
UPDATE queue_manual_adjustment a SET list_id = f.list_id
  FROM first_list f WHERE f.user_id = a.user_id AND a.list_id IS NULL;
ALTER TABLE queue_manual_adjustment ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE queue_manual_adjustment DROP CONSTRAINT queue_manual_adjustment_pkey;
ALTER TABLE queue_manual_adjustment ADD CONSTRAINT queue_manual_adjustment_pkey PRIMARY KEY (list_id, game_id);
ALTER TABLE queue_manual_adjustment ADD CONSTRAINT queue_manual_adjustment_list_fk
  FOREIGN KEY (user_id, list_id) REFERENCES game_list (user_id, id) ON DELETE CASCADE;
-- a PK antiga (user_id, game_id) atendia a FK → library_entry (user_id, game_id)
CREATE INDEX IF NOT EXISTS queue_manual_adjustment_user_game_idx
  ON queue_manual_adjustment (user_id, game_id);

-- ---------------------------------------------------------------- queue_move_event: histórico por lista
ALTER TABLE queue_move_event ADD COLUMN IF NOT EXISTS list_id uuid;
UPDATE queue_move_event m SET list_id = f.list_id
  FROM first_list f WHERE f.user_id = m.user_id AND m.list_id IS NULL;
ALTER TABLE queue_move_event ALTER COLUMN list_id SET NOT NULL;
ALTER TABLE queue_move_event ADD CONSTRAINT queue_move_event_list_fk
  FOREIGN KEY (user_id, list_id) REFERENCES game_list (user_id, id) ON DELETE CASCADE;
-- leitura do histórico da lista (últimos N) e cascata do DELETE da lista
CREATE INDEX IF NOT EXISTS queue_move_event_list_time_idx
  ON queue_move_event (list_id, created_at DESC, id DESC);
DROP VIEW first_list;

-- ---------------------------------------------------------------- funções da fila com lista
DROP FUNCTION IF EXISTS apply_queue_move(uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint);
CREATE FUNCTION apply_queue_move(
  p_user_id        uuid,
  p_list_id        uuid,
  p_game_id        bigint,
  p_from_position  integer,
  p_to_position    integer,
  p_points_delta   numeric,
  p_source         text    DEFAULT 'drag',
  p_request_id     uuid    DEFAULT NULL,
  p_queue_version  bigint  DEFAULT NULL,
  p_score_before   numeric DEFAULT NULL,
  p_anchor_game_id bigint  DEFAULT NULL
) RETURNS queue_manual_adjustment
LANGUAGE plpgsql SET search_path = public, extensions AS $$
DECLARE
  adj queue_manual_adjustment;
BEGIN
  -- Retry do mesmo request: devolve o estado atual sem aplicar de novo
  IF p_request_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM queue_move_event WHERE user_id = p_user_id AND client_request_id = p_request_id) THEN
    SELECT * INTO adj FROM queue_manual_adjustment WHERE list_id = p_list_id AND game_id = p_game_id;
    RETURN adj;
  END IF;

  INSERT INTO queue_manual_adjustment (user_id, list_id, game_id)
  VALUES (p_user_id, p_list_id, p_game_id)
  ON CONFLICT (list_id, game_id) DO NOTHING;

  SELECT * INTO adj FROM queue_manual_adjustment
   WHERE list_id = p_list_id AND game_id = p_game_id AND user_id = p_user_id
   FOR UPDATE;                                   -- serializa movimentos do mesmo jogo na lista

  INSERT INTO queue_move_event (user_id, list_id, game_id, kind, from_position, to_position, points_delta,
                                flat_points_before, flat_points_after, score_before, anchor_game_id,
                                queue_version, source, client_request_id)
  VALUES (p_user_id, p_list_id, p_game_id, 'move', p_from_position, p_to_position, p_points_delta,
          adj.flat_points, adj.flat_points + p_points_delta, p_score_before, p_anchor_game_id,
          p_queue_version, p_source, p_request_id);

  UPDATE queue_manual_adjustment
     SET flat_points       = flat_points + p_points_delta,
         previous_position = p_from_position,
         manual_position   = p_to_position,
         move_count        = move_count + 1,
         last_moved_at     = now()
   WHERE list_id = p_list_id AND game_id = p_game_id
  RETURNING * INTO adj;

  RETURN adj;
END $$;

-- Zera o ajuste manual de um jogo (ou de todos, p_game_id NULL) da lista, auditando
DROP FUNCTION IF EXISTS reset_queue_adjustments(uuid, bigint);
CREATE FUNCTION reset_queue_adjustments(p_user_id uuid, p_list_id uuid, p_game_id bigint DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SET search_path = public, extensions AS $$
DECLARE n integer;
BEGIN
  INSERT INTO queue_move_event (user_id, list_id, game_id, kind, points_delta, flat_points_before,
                                flat_points_after, source)
  SELECT user_id, list_id, game_id, 'reset', -flat_points, flat_points, 0, 'api'
    FROM queue_manual_adjustment
   WHERE user_id = p_user_id AND list_id = p_list_id
     AND (p_game_id IS NULL OR game_id = p_game_id) AND flat_points <> 0;
  DELETE FROM queue_manual_adjustment
   WHERE user_id = p_user_id AND list_id = p_list_id AND (p_game_id IS NULL OR game_id = p_game_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---------------------------------------------------------------- RLS e grants (mesmo padrão de 003_rls)
ALTER TABLE public.game_list ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_list_owner ON public.game_list;
CREATE POLICY game_list_owner ON public.game_list FOR ALL TO authenticated
  USING (user_id = (SELECT public.current_app_user_id()))
  WITH CHECK (user_id = (SELECT public.current_app_user_id()));
REVOKE ALL ON public.game_list FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_list TO authenticated;

REVOKE ALL ON FUNCTION public.apply_queue_move(uuid, uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_queue_adjustments(uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_queue_move(uuid, uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_queue_adjustments(uuid, uuid, bigint) TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.apply_queue_move(uuid, uuid, bigint, integer, integer, numeric, text, uuid, bigint, numeric, bigint) TO service_role;
    GRANT EXECUTE ON FUNCTION public.reset_queue_adjustments(uuid, uuid, bigint) TO service_role;
  END IF;
END $$;
