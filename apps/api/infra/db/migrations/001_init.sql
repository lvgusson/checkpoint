-- =============================================================================
-- Checkpoint — schema PostgreSQL 16+ (validado também em PG 17)
-- 001_init: catálogo global, biblioteca por usuário, metadados de mídia,
--           pesos de pontuação e reordenação manual da fila.
--
-- Idempotente: pode ser executado mais de uma vez (IF NOT EXISTS, CREATE OR
-- REPLACE, blocos DO para tipos). Compatível com Supabase (extensões no schema
-- "extensions" são detectadas dinamicamente).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
-- Padrão Supabase: extensões no schema "extensions" (no Postgres puro ele é criado aqui).
-- Se a extensão já existir em outro schema (ex.: public), IF NOT EXISTS mantém onde está.
CREATE SCHEMA IF NOT EXISTS extensions;
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm   WITH SCHEMA extensions; -- busca por substring indexada
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA extensions; -- GIN composto (user_id + array/trgm)
CREATE EXTENSION IF NOT EXISTS unaccent  WITH SCHEMA extensions; -- busca/ordenação sem acento

CREATE TABLE IF NOT EXISTS schema_migration (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- unaccent() é STABLE (depende do dicionário); para usar em colunas geradas e
-- índices é preciso um wrapper IMMUTABLE com dicionário qualificado pelo schema.
-- O schema da extensão é descoberto em tempo de migração (public, extensions...).
DO $do$
DECLARE s text;
BEGIN
  SELECT n.nspname INTO s
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'unaccent';
  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
       LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
       AS $b$ SELECT %1$I.unaccent(%2$L::regdictionary, $1) $b$$f$,
    s, s || '.unaccent');
END
$do$;

-- Chave normalizada usada em lookups, unicidade e busca:
-- "  Frenético " -> "frenetico". Igual ao normal() de api/src/scoring.ts.
CREATE OR REPLACE FUNCTION norm_key(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT lower(btrim(public.immutable_unaccent($1))) $$;

-- "Devil May Cry 3: Special Edition" -> "devil-may-cry-3-special-edition"
CREATE OR REPLACE FUNCTION slugify(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT btrim(regexp_replace(public.norm_key($1), '[^a-z0-9]+', '-', 'g'), '-') $$;

-- -----------------------------------------------------------------------------
-- Tipos enumerados (códigos estáveis em inglês; rótulos pt-BR nas tabelas ref_*)
-- A ordem de declaração importa: ORDER BY desire coloca "Muito Alta" primeiro.
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE game_status AS ENUM ('not_started', 'playing', 'abandoned', 'finished');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE desire_level AS ENUM ('very_high', 'high', 'medium', 'low', 'very_low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE metadata_confidence AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabelas de domínio: rótulo exibido na API/planilha + atributos usados pela regra.
CREATE TABLE IF NOT EXISTS ref_status (
  code           game_status PRIMARY KEY,
  label_pt       text     NOT NULL UNIQUE,
  sort_order     smallint NOT NULL,
  queue_eligible boolean  NOT NULL      -- entra na fila (se a campanha tiver fim)
);
INSERT INTO ref_status (code, label_pt, sort_order, queue_eligible) VALUES
  ('not_started', 'Não iniciado', 1, true),
  ('playing',     'Jogando',      2, true),
  ('abandoned',   'Abandonado',   3, false),
  ('finished',    'Finalizado',   4, false)
ON CONFLICT (code) DO UPDATE SET label_pt = EXCLUDED.label_pt,
  sort_order = EXCLUDED.sort_order, queue_eligible = EXCLUDED.queue_eligible;

CREATE TABLE IF NOT EXISTS ref_desire (
  code       desire_level PRIMARY KEY,
  label_pt   text     NOT NULL UNIQUE,
  points     smallint NOT NULL CHECK (points BETWEEN 0 AND 100), -- usado no baseScore
  sort_order smallint NOT NULL
);
INSERT INTO ref_desire (code, label_pt, points, sort_order) VALUES
  ('very_high', 'Muito Alta', 100, 1),
  ('high',      'Alta',        75, 2),
  ('medium',    'Média',       50, 3),
  ('low',       'Baixa',       25, 4),
  ('very_low',  'Muito Baixa',  0, 5)
ON CONFLICT (code) DO UPDATE SET label_pt = EXCLUDED.label_pt,
  points = EXCLUDED.points, sort_order = EXCLUDED.sort_order;

-- -----------------------------------------------------------------------------
-- Usuários do app. NÃO é auth.users: id próprio (uuid) + vínculo opcional
-- auth_user_id -> auth.users(id) (FK criada em 003 se o schema auth existir).
-- O dono padrão do seed nasce sem vínculo e é "reivindicado" depois (README).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_user (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  email        text,
  display_name text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_email_chk CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+$')
);
CREATE UNIQUE INDEX IF NOT EXISTS app_user_email_uq ON app_user (lower(email)) WHERE email IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Vocabulários (gênero, mecânica, tag, loja): id pequeno + chave normalizada
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genre (
  id   smallint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  key  text GENERATED ALWAYS AS (norm_key(name)) STORED,
  CONSTRAINT genre_key_uq UNIQUE (key)
);
CREATE TABLE IF NOT EXISTS mechanic (
  id   smallint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 120),
  key  text GENERATED ALWAYS AS (norm_key(name)) STORED,
  CONSTRAINT mechanic_key_uq UNIQUE (key)
);
CREATE TABLE IF NOT EXISTS tag (
  id   integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  key  text GENERATED ALWAYS AS (norm_key(name)) STORED,
  CONSTRAINT tag_key_uq UNIQUE (key)
);
CREATE TABLE IF NOT EXISTS store (
  id   smallint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  key  text GENERATED ALWAYS AS (norm_key(name)) STORED,
  CONSTRAINT store_key_uq UNIQUE (key)
);

-- -----------------------------------------------------------------------------
-- game: catálogo GLOBAL (a obra), compartilhado entre usuários.
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS game_code_seq START 1;

CREATE TABLE IF NOT EXISTS game (
  id                       bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, -- chave interna (FKs/joins)
  code                     text NOT NULL DEFAULT ('G' || lpad(nextval('game_code_seq')::text, 5, '0')),
                                                     -- id público estável; "J0021" para o seed
  slug                     text NOT NULL,            -- URL amigável; preenchido por trigger se vazio
  name                     text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 300),
  primary_genre_id         smallint REFERENCES genre (id),
  mechanic_id              smallint REFERENCES mechanic (id),
  pace                     text NOT NULL DEFAULT '' CHECK (length(pace) <= 60),       -- Calmo/Moderado/Frenético
  structure                text NOT NULL DEFAULT '' CHECK (length(structure) <= 120), -- "Sem fim definido" etc.
  coop                     text NOT NULL DEFAULT '' CHECK (length(coop) <= 60),
  size_label               text NOT NULL DEFAULT '' CHECK (length(size_label) <= 60),
  main_hours               numeric(9,2) CHECK (main_hours BETWEEN 0 AND 100000),
  extra_hours              numeric(9,2) CHECK (extra_hours BETWEEN 0 AND 100000),
  completionist_hours      numeric(9,2) CHECK (completionist_hours BETWEEN 0 AND 100000),
  previous_estimated_hours numeric(9,2) CHECK (previous_estimated_hours BETWEEN 0 AND 100000),
  time_verification        text NOT NULL DEFAULT '',
  time_source              text NOT NULL DEFAULT '',
  review_notes             text NOT NULL DEFAULT '' CHECK (length(review_notes) <= 10000),
  prerequisite_game_id     bigint REFERENCES game (id) ON DELETE SET NULL,
  steam_app_id             integer CHECK (steam_app_id > 0), -- NÃO único: coletâneas (DMC 1/2/3 = 631510)

  -- Desnormalizado de game_tag (fonte da verdade) — trigger trg_game_tag_sync
  tag_ids                  integer[] NOT NULL DEFAULT '{}',
  tag_names                text[]    NOT NULL DEFAULT '{}',

  -- Desnormalizado de game_metadata ("card" da listagem) — trigger trg_game_metadata_sync
  cover_url                text,
  header_url               text,
  short_description        text,
  release_date             date,
  release_year             smallint,
  developers               text[] NOT NULL DEFAULT '{}',
  metadata_confidence      metadata_confidence,
  metadata_fetched_at      timestamptz,

  -- Mantido por trigger (array_to_string não é IMMUTABLE, então não pode ser coluna gerada)
  search_text              text NOT NULL DEFAULT '',

  -- Colunas geradas (sem lógica duplicada na aplicação)
  is_endless     boolean GENERATED ALWAYS AS (norm_key(structure) = 'sem fim definido') STORED,
  estimate_hours numeric(9,2) GENERATED ALWAYS AS (          -- mesma ordem de estimate() em scoring.ts
                   CASE WHEN extra_hours > 0 THEN extra_hours
                        WHEN main_hours  > 0 THEN main_hours
                        WHEN previous_estimated_hours > 0 THEN previous_estimated_hours END) STORED,
  sort_name      text GENERATED ALWAYS AS (norm_key(name)) STORED,
  card_cover_url text GENERATED ALWAYS AS (
                   coalesce(cover_url, header_url,
                     CASE WHEN steam_app_id IS NOT NULL THEN
                       'https://cdn.akamai.steamstatic.com/steam/apps/' || steam_app_id::text || '/header.jpg'
                     END)) STORED,

  created_by     uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT game_code_uq UNIQUE (code),
  CONSTRAINT game_slug_uq UNIQUE (slug),
  CONSTRAINT game_code_chk CHECK (code ~ '^[A-Za-z0-9_-]{1,64}$'),
  CONSTRAINT game_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT game_prereq_self_chk CHECK (prerequisite_game_id IS DISTINCT FROM id),
  CONSTRAINT game_tags_len_chk CHECK (cardinality(tag_ids) = cardinality(tag_names))
);

CREATE INDEX IF NOT EXISTS game_prerequisite_idx ON game (prerequisite_game_id) WHERE prerequisite_game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_steam_app_idx    ON game (steam_app_id) WHERE steam_app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_genre_idx        ON game (primary_genre_id);
CREATE INDEX IF NOT EXISTS game_sort_name_idx    ON game (sort_name, id);
CREATE INDEX IF NOT EXISTS game_search_trgm_idx  ON game USING gin (search_text gin_trgm_ops); -- busca global ("adicionar jogo")
CREATE INDEX IF NOT EXISTS game_tag_ids_gin_idx  ON game USING gin (tag_ids);
CREATE INDEX IF NOT EXISTS game_developers_gin_idx ON game USING gin (developers);

-- Relação normalizada jogo↔tag (até 3 por regra de negócio; posição preserva a ordem)
CREATE TABLE IF NOT EXISTS game_tag (
  game_id  bigint   NOT NULL REFERENCES game (id) ON DELETE CASCADE,
  tag_id   integer  NOT NULL REFERENCES tag (id) ON DELETE RESTRICT,
  position smallint NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 20),
  PRIMARY KEY (game_id, tag_id)
);
CREATE INDEX IF NOT EXISTS game_tag_tag_idx ON game_tag (tag_id, game_id);

-- -----------------------------------------------------------------------------
-- Metadados de mídia (data/metadata/game-metadata.json), 1:1 com game
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_metadata (
  game_id           bigint PRIMARY KEY REFERENCES game (id) ON DELETE CASCADE,
  matched_title     text,
  steam_app_id      integer CHECK (steam_app_id > 0),
  cover_url         text,
  header_url        text,
  hero_url          text,
  short_description text,
  description       text,
  description_lang  text CHECK (description_lang IN ('pt-BR', 'en')),
  release_date      date,          -- parseado quando possível
  release_date_text text,          -- valor bruto da fonte ("12 Mar, 2019", "Coming soon")
  developers        text[] NOT NULL DEFAULT '{}',
  publishers        text[] NOT NULL DEFAULT '{}',
  source_genres     text[] NOT NULL DEFAULT '{}',
  confidence        metadata_confidence NOT NULL,
  notes             text NOT NULL DEFAULT '',
  fetched_at        timestamptz NOT NULL,
  extra             jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(extra) = 'object'), -- campos futuros do coletor
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_metadata_steam_idx      ON game_metadata (steam_app_id) WHERE steam_app_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_metadata_confidence_idx ON game_metadata (confidence, fetched_at);
CREATE INDEX IF NOT EXISTS game_metadata_publishers_gin ON game_metadata USING gin (publishers);
CREATE INDEX IF NOT EXISTS game_metadata_src_genres_gin ON game_metadata USING gin (source_genres);

CREATE TABLE IF NOT EXISTS game_screenshot (
  game_id   bigint   NOT NULL REFERENCES game_metadata (game_id) ON DELETE CASCADE,
  position  smallint NOT NULL CHECK (position >= 0),
  thumb_url text     NOT NULL,
  full_url  text     NOT NULL,
  PRIMARY KEY (game_id, position)
);
CREATE TABLE IF NOT EXISTS game_trailer (
  game_id   bigint   NOT NULL REFERENCES game_metadata (game_id) ON DELETE CASCADE,
  position  smallint NOT NULL CHECK (position >= 0),
  name      text     NOT NULL DEFAULT '',
  thumb_url text,
  url       text     NOT NULL,
  PRIMARY KEY (game_id, position)
);
CREATE TABLE IF NOT EXISTS game_metadata_source (
  game_id  bigint   NOT NULL REFERENCES game_metadata (game_id) ON DELETE CASCADE,
  position smallint NOT NULL CHECK (position >= 0),
  kind     text     NOT NULL CHECK (btrim(kind) <> ''),  -- "steam", "igdb", "wikipedia"...
  url      text     NOT NULL,
  PRIMARY KEY (game_id, position)
);

-- -----------------------------------------------------------------------------
-- library_entry: o jogo NA BIBLIOTECA de um usuário (estado pessoal)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS library_entry (
  id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id          uuid   NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  game_id          bigint NOT NULL REFERENCES game (id) ON DELETE RESTRICT,
  status           game_status  NOT NULL DEFAULT 'not_started',
  desire           desire_level NOT NULL DEFAULT 'medium',
  store_id         smallint REFERENCES store (id),
  platform         text NOT NULL DEFAULT 'PC' CHECK (length(platform) <= 60),
  actual_hours     numeric(9,2) CHECK (actual_hours BETWEEN 0 AND 100000),
  started_at       date,
  finished_at      date,
  rating           numeric(2,1) CHECK (rating BETWEEN 1 AND 5),
  notes            text NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  steam_hours      numeric(9,2) CHECK (steam_hours >= 0),
  steam_updated_at timestamptz,
  imported         jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(imported) = 'object'),
                   -- legado da planilha: plannedHours, affinity, baseScore, queueScore, previousPendingId

  -- Resultado materializado de scoreGames() (escrito pela aplicação ao recalcular).
  -- NÃO dispara invalidação da fila (são saídas, não entradas).
  planned_hours    numeric(9,2),
  affinity         numeric(5,1),
  base_score       numeric(6,1),
  scored_at        timestamptz,

  -- Desnormalizado de game (trigger trg_library_entry_fill + propagação trg_game_propagate)
  game_code        text     NOT NULL DEFAULT '',
  sort_name        text     NOT NULL DEFAULT '',
  search_text      text     NOT NULL DEFAULT '',
  primary_genre_id smallint,
  tag_ids          integer[] NOT NULL DEFAULT '{}',
  is_endless       boolean  NOT NULL DEFAULT false,

  is_queue_candidate boolean GENERATED ALWAYS AS (
                     status IN ('not_started', 'playing') AND NOT is_endless) STORED,

  version          integer NOT NULL DEFAULT 1,  -- concorrência otimista (If-Match / ETag)
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT library_entry_user_game_uq UNIQUE (user_id, game_id)
);

-- Ordenações da tela de lista: (user_id, chave de ordenação, id) => keyset/LIMIT sem sort
CREATE INDEX IF NOT EXISTS library_entry_user_name_idx   ON library_entry (user_id, sort_name, id);
CREATE INDEX IF NOT EXISTS library_entry_user_score_idx  ON library_entry (user_id, base_score DESC NULLS LAST, id);
CREATE INDEX IF NOT EXISTS library_entry_user_desire_idx ON library_entry (user_id, desire, sort_name, id);
-- Filtros/contagens
CREATE INDEX IF NOT EXISTS library_entry_user_status_idx ON library_entry (user_id, status, sort_name);
CREATE INDEX IF NOT EXISTS library_entry_user_genre_idx  ON library_entry (user_id, primary_genre_id);
CREATE INDEX IF NOT EXISTS library_entry_user_store_idx  ON library_entry (user_id, store_id);
CREATE INDEX IF NOT EXISTS library_entry_user_tags_gin   ON library_entry USING gin (user_id, tag_ids);
CREATE INDEX IF NOT EXISTS library_entry_user_search_gin ON library_entry USING gin (user_id, search_text gin_trgm_ops);
-- Candidatos da fila (parcial: só pendentes com fim definido)
CREATE INDEX IF NOT EXISTS library_entry_queue_idx       ON library_entry (user_id, game_id) WHERE is_queue_candidate;
-- Histórico p/ contexto da fila (últimos 3 finalizados)
CREATE INDEX IF NOT EXISTS library_entry_finished_idx    ON library_entry (user_id, finished_at DESC) WHERE status = 'finished';
-- Propagação game -> entries
CREATE INDEX IF NOT EXISTS library_entry_game_idx        ON library_entry (game_id);

-- -----------------------------------------------------------------------------
-- Pesos do algoritmo por usuário (ScoreWeights inteiro como jsonb: lido sempre inteiro)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_score_weights (
  user_id    uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
  weights    jsonb NOT NULL CHECK (jsonb_typeof(weights) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Reordenação manual da fila (drag-and-drop)
--   queue_manual_adjustment: estado acumulado por (usuário, jogo)
--   queue_move_event:        auditoria imutável de cada movimento
-- score final na fila = score do algoritmo (contextual) + flat_points
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS queue_manual_adjustment (
  user_id           uuid   NOT NULL,
  game_id           bigint NOT NULL,
  flat_points       numeric(8,2) NOT NULL DEFAULT 0 CHECK (flat_points BETWEEN -100000 AND 100000),
  manual_position   integer CHECK (manual_position > 0),   -- posição onde o usuário soltou (última)
  previous_position integer CHECK (previous_position > 0), -- posição antes do último movimento
  move_count        integer NOT NULL DEFAULT 0 CHECK (move_count >= 0),
  last_moved_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id),
  FOREIGN KEY (user_id, game_id) REFERENCES library_entry (user_id, game_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS queue_move_event (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid   NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  game_id            bigint NOT NULL REFERENCES game (id) ON DELETE CASCADE,
                     -- sem FK para library_entry: a auditoria sobrevive à remoção da biblioteca
  kind               text NOT NULL DEFAULT 'move' CHECK (kind IN ('move', 'reset', 'set')),
  from_position      integer CHECK (from_position > 0),
  to_position        integer CHECK (to_position > 0),
  points_delta       numeric(8,2) NOT NULL,
  flat_points_before numeric(8,2) NOT NULL,
  flat_points_after  numeric(8,2) NOT NULL,
  score_before       numeric(8,2),   -- score final exibido no momento do movimento (opcional)
  anchor_game_id     bigint REFERENCES game (id) ON DELETE SET NULL, -- jogo que ocupava to_position (opcional)
  queue_version      bigint,         -- inputs_version da fila que o usuário via (detecta movimento sobre fila velha)
  source             text NOT NULL DEFAULT 'drag' CHECK (source IN ('drag', 'keyboard', 'button', 'api', 'system')),
  client_request_id  uuid,           -- idempotência de retries do front
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT queue_move_event_after_chk CHECK (flat_points_after = flat_points_before + points_delta OR kind <> 'move')
);
CREATE UNIQUE INDEX IF NOT EXISTS queue_move_event_request_uq ON queue_move_event (user_id, client_request_id) WHERE client_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS queue_move_event_user_time_idx ON queue_move_event (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS queue_move_event_user_game_idx ON queue_move_event (user_id, game_id, created_at DESC);
-- FKs sem índice líder tornam DELETE no lado referenciado um seq scan
CREATE INDEX IF NOT EXISTS queue_move_event_game_idx      ON queue_move_event (game_id);
CREATE INDEX IF NOT EXISTS queue_move_event_anchor_idx    ON queue_move_event (anchor_game_id) WHERE anchor_game_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS game_mechanic_idx              ON game (mechanic_id);
CREATE INDEX IF NOT EXISTS game_created_by_idx            ON game (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS library_entry_store_idx        ON library_entry (store_id);

-- =============================================================================
-- Funções de trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- game: slug automático + search_text (nome + tags, sem acento, minúsculo)
CREATE OR REPLACE FUNCTION trg_game_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := coalesce(nullif(slugify(NEW.name), ''), lower(NEW.code));
    IF EXISTS (SELECT 1 FROM game WHERE slug = NEW.slug AND id IS DISTINCT FROM NEW.id) THEN
      NEW.slug := NEW.slug || '-' || slugify(NEW.code);
    END IF;
  END IF;
  NEW.search_text := norm_key(NEW.name || ' ' || array_to_string(NEW.tag_names, ' '));
  IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
  RETURN NEW;
END $$;

-- game_tag -> game.tag_ids / tag_names (ordem por position)
CREATE OR REPLACE FUNCTION refresh_game_tags(p_game_id bigint) RETURNS void LANGUAGE sql
  SECURITY DEFINER SET search_path = public, extensions AS $$
  UPDATE game g
     SET tag_ids   = coalesce(t.ids, '{}'),
         tag_names = coalesce(t.names, '{}')
    FROM (SELECT array_agg(gt.tag_id ORDER BY gt.position, tg.key) AS ids,
                 array_agg(tg.name   ORDER BY gt.position, tg.key) AS names
            FROM game_tag gt JOIN tag tg ON tg.id = gt.tag_id
           WHERE gt.game_id = p_game_id) t
   WHERE g.id = p_game_id
     AND (g.tag_ids IS DISTINCT FROM coalesce(t.ids, '{}')
          OR g.tag_names IS DISTINCT FROM coalesce(t.names, '{}'));
$$;

CREATE OR REPLACE FUNCTION trg_game_tag_sync() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM refresh_game_tags(OLD.game_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.game_id <> OLD.game_id) THEN
    PERFORM refresh_game_tags(NEW.game_id);
  END IF;
  RETURN NULL;
END $$;

-- tag renomeada -> refaz tag_names dos jogos que a usam
CREATE OR REPLACE FUNCTION trg_tag_rename() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  PERFORM refresh_game_tags(gt.game_id) FROM game_tag gt WHERE gt.tag_id = NEW.id;
  RETURN NULL;
END $$;

-- game_metadata -> colunas "card" em game
CREATE OR REPLACE FUNCTION trg_game_metadata_sync() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE game SET cover_url = NULL, header_url = NULL, short_description = NULL,
                    release_date = NULL, release_year = NULL, developers = '{}',
                    metadata_confidence = NULL, metadata_fetched_at = NULL
     WHERE id = OLD.game_id;
    RETURN NULL;
  END IF;
  UPDATE game SET
      cover_url           = NEW.cover_url,
      header_url          = NEW.header_url,
      short_description   = NEW.short_description,
      release_date        = NEW.release_date,
      release_year        = coalesce(extract(year FROM NEW.release_date)::smallint,
                                     substring(NEW.release_date_text FROM '(?:19|20)\d{2}')::smallint),
      developers          = NEW.developers,
      metadata_confidence = NEW.confidence,
      metadata_fetched_at = NEW.fetched_at,
      steam_app_id        = coalesce(steam_app_id, NEW.steam_app_id)
   WHERE id = NEW.game_id;
  RETURN NULL;
END $$;

-- library_entry: copia campos de game (fonte única) em todo INSERT/UPDATE
CREATE OR REPLACE FUNCTION trg_library_entry_fill() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g game%ROWTYPE;
BEGIN
  SELECT * INTO g FROM game WHERE id = NEW.game_id;
  NEW.game_code        := g.code;
  NEW.sort_name        := g.sort_name;
  NEW.search_text      := g.search_text;
  NEW.primary_genre_id := g.primary_genre_id;
  NEW.tag_ids          := g.tag_ids;
  NEW.is_endless       := g.is_endless;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    -- version só sobe em mudanças do usuário, não em propagação/score materializado
    IF (NEW.status, NEW.desire, NEW.store_id, NEW.platform, NEW.actual_hours, NEW.started_at,
        NEW.finished_at, NEW.rating, NEW.notes, NEW.steam_hours, NEW.game_id)
       IS DISTINCT FROM
       (OLD.status, OLD.desire, OLD.store_id, OLD.platform, OLD.actual_hours, OLD.started_at,
        OLD.finished_at, OLD.rating, OLD.notes, OLD.steam_hours, OLD.game_id) THEN
      NEW.version := OLD.version + 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- game -> library_entry (só quando um campo desnormalizado muda de fato)
CREATE OR REPLACE FUNCTION trg_game_propagate() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  UPDATE library_entry e
     SET game_code = NEW.code, sort_name = NEW.sort_name, search_text = NEW.search_text,
         primary_genre_id = NEW.primary_genre_id, tag_ids = NEW.tag_ids, is_endless = NEW.is_endless
   WHERE e.game_id = NEW.id;
  RETURN NULL;
END $$;

-- =============================================================================
-- Triggers (CREATE OR REPLACE TRIGGER: PG 14+)
-- =============================================================================
CREATE OR REPLACE TRIGGER trg_app_user_touch BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE OR REPLACE TRIGGER trg_game_metadata_touch BEFORE UPDATE ON game_metadata
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE OR REPLACE TRIGGER trg_qma_touch BEFORE UPDATE ON queue_manual_adjustment
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();
CREATE OR REPLACE TRIGGER trg_weights_touch BEFORE UPDATE ON user_score_weights
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

CREATE OR REPLACE TRIGGER trg_game_before_write BEFORE INSERT OR UPDATE ON game
  FOR EACH ROW EXECUTE FUNCTION trg_game_before_write();

CREATE OR REPLACE TRIGGER trg_game_tag_sync AFTER INSERT OR UPDATE OR DELETE ON game_tag
  FOR EACH ROW EXECUTE FUNCTION trg_game_tag_sync();

CREATE OR REPLACE TRIGGER trg_tag_rename AFTER UPDATE OF name ON tag
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION trg_tag_rename();

CREATE OR REPLACE TRIGGER trg_game_metadata_sync AFTER INSERT OR UPDATE OR DELETE ON game_metadata
  FOR EACH ROW EXECUTE FUNCTION trg_game_metadata_sync();

CREATE OR REPLACE TRIGGER trg_library_entry_fill BEFORE INSERT OR UPDATE ON library_entry
  FOR EACH ROW EXECUTE FUNCTION trg_library_entry_fill();

CREATE OR REPLACE TRIGGER trg_game_propagate AFTER UPDATE ON game
  FOR EACH ROW
  WHEN ((OLD.code, OLD.sort_name, OLD.search_text, OLD.primary_genre_id, OLD.tag_ids, OLD.is_endless)
        IS DISTINCT FROM
        (NEW.code, NEW.sort_name, NEW.search_text, NEW.primary_genre_id, NEW.tag_ids, NEW.is_endless))
  EXECUTE FUNCTION trg_game_propagate();

-- =============================================================================
-- Movimento manual da fila (atômico + idempotente)
-- A aplicação calcula p_points_delta (ver README); a função só persiste.
-- =============================================================================
CREATE OR REPLACE FUNCTION apply_queue_move(
  p_user_id       uuid,
  p_game_id       bigint,
  p_from_position integer,
  p_to_position   integer,
  p_points_delta  numeric,
  p_source        text    DEFAULT 'drag',
  p_request_id    uuid    DEFAULT NULL,
  p_queue_version bigint  DEFAULT NULL,
  p_score_before  numeric DEFAULT NULL,
  p_anchor_game_id bigint DEFAULT NULL
) RETURNS queue_manual_adjustment
LANGUAGE plpgsql AS $$
DECLARE
  adj queue_manual_adjustment;
BEGIN
  -- Retry do mesmo request: devolve o estado atual sem aplicar de novo
  IF p_request_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM queue_move_event WHERE user_id = p_user_id AND client_request_id = p_request_id) THEN
    SELECT * INTO adj FROM queue_manual_adjustment WHERE user_id = p_user_id AND game_id = p_game_id;
    RETURN adj;
  END IF;

  INSERT INTO queue_manual_adjustment (user_id, game_id)
  VALUES (p_user_id, p_game_id)
  ON CONFLICT (user_id, game_id) DO NOTHING;

  SELECT * INTO adj FROM queue_manual_adjustment
   WHERE user_id = p_user_id AND game_id = p_game_id
   FOR UPDATE;                                   -- serializa movimentos do mesmo jogo

  INSERT INTO queue_move_event (user_id, game_id, kind, from_position, to_position, points_delta,
                                flat_points_before, flat_points_after, score_before, anchor_game_id,
                                queue_version, source, client_request_id)
  VALUES (p_user_id, p_game_id, 'move', p_from_position, p_to_position, p_points_delta,
          adj.flat_points, adj.flat_points + p_points_delta, p_score_before, p_anchor_game_id,
          p_queue_version, p_source, p_request_id);

  UPDATE queue_manual_adjustment
     SET flat_points       = flat_points + p_points_delta,
         previous_position = p_from_position,
         manual_position   = p_to_position,
         move_count        = move_count + 1,
         last_moved_at     = now()
   WHERE user_id = p_user_id AND game_id = p_game_id
  RETURNING * INTO adj;

  RETURN adj;
END $$;

-- Zera o ajuste manual de um jogo (ou de todos, p_game_id NULL), auditando
CREATE OR REPLACE FUNCTION reset_queue_adjustments(p_user_id uuid, p_game_id bigint DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO queue_move_event (user_id, game_id, kind, points_delta, flat_points_before, flat_points_after, source)
  SELECT user_id, game_id, 'reset', -flat_points, flat_points, 0, 'api'
    FROM queue_manual_adjustment
   WHERE user_id = p_user_id AND (p_game_id IS NULL OR game_id = p_game_id) AND flat_points <> 0;
  DELETE FROM queue_manual_adjustment
   WHERE user_id = p_user_id AND (p_game_id IS NULL OR game_id = p_game_id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- =============================================================================
-- View de conveniência da listagem (1 linha = 1 card). Joins só por PK.
-- =============================================================================
CREATE OR REPLACE VIEW library_card AS
SELECT e.id            AS entry_id,
       e.user_id,
       g.id            AS game_id,
       g.code,
       g.slug,
       g.name,
       ge.name         AS primary_genre,
       rs.label_pt     AS status_label,
       e.status,
       rd.label_pt     AS desire_label,
       e.desire,
       st.name         AS store,
       e.platform,
       g.tag_names     AS secondary_tags,
       g.card_cover_url AS cover_url,
       g.short_description,
       g.release_year,
       g.estimate_hours,
       e.actual_hours,
       e.rating,
       e.planned_hours,
       e.affinity,
       e.base_score,
       e.is_queue_candidate,
       e.sort_name,
       e.search_text,
       e.tag_ids,
       e.primary_genre_id,
       e.store_id,
       e.updated_at
  FROM library_entry e
  JOIN game g        ON g.id = e.game_id
  JOIN ref_status rs ON rs.code = e.status
  JOIN ref_desire rd ON rd.code = e.desire
  LEFT JOIN genre ge ON ge.id = g.primary_genre_id
  LEFT JOIN store st ON st.id = e.store_id;

INSERT INTO schema_migration (version) VALUES ('001_init') ON CONFLICT DO NOTHING;

COMMIT;
