BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Use the extension schema for the trigram operator class.
SET LOCAL search_path = public, extensions;

-- PgGamesDriver.list and PgQueueInputsDriver.load read one user's entries in ID order.
CREATE INDEX IF NOT EXISTS library_entry_user_id_idx ON public.library_entry (user_id, id);

-- PgListsDriver.list and PgQueueInputsDriver.load select lists by creation time and ID.
CREATE INDEX IF NOT EXISTS game_list_user_created_idx ON public.game_list (user_id, created_at, id);

-- PgGamesDriver.searchByName filters normalized names with a substring LIKE query.
CREATE INDEX IF NOT EXISTS game_name_normalized_trgm_idx ON public.game USING gin (public.norm_key(name) gin_trgm_ops);

-- PgConfigDriver.remove deletes paces; the foreign key checks game.pace for references.
CREATE INDEX IF NOT EXISTS game_pace_idx ON public.game (pace);

-- PgConfigDriver.remove deletes structures; the foreign key checks game.structure for references.
CREATE INDEX IF NOT EXISTS game_structure_idx ON public.game (structure);

-- PgConfigDriver.remove deletes platforms; the foreign key checks library_entry.platform for references.
CREATE INDEX IF NOT EXISTS library_entry_platform_idx ON public.library_entry (platform);

-- PgReleaseDriver.bySha and deployed find releases including rollbacks by environment and commit.
CREATE INDEX IF NOT EXISTS app_release_env_sha_id_idx ON public.app_release (environment, git_sha, id DESC);

COMMIT;
