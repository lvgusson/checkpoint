-- =============================================================================
-- 006_app_release: histórico de versões publicadas do app (deploys da Vercel).
--
-- * Uma linha por deploy, gravada no build por scripts/record-release.mjs.
-- * Serve de catálogo para rollback (scripts/rollback.mjs): vercel rollback para
--   o deploy alvo ou git revert até o commit alvo.
-- * db_migration_version registra a última migration aplicada no momento do
--   deploy: migrations NÃO são revertidas por rollback de código.
-- * RLS ligada sem policies e sem grants para anon/authenticated: só a API/
--   scripts via conexão direta (dono da tabela) leem e escrevem.
-- =============================================================================

CREATE TABLE IF NOT EXISTS app_release (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  version              text        NOT NULL,                 -- semver do package.json
  git_sha              text        NOT NULL,
  git_ref              text,                                 -- branch
  commit_message       text,
  vercel_deployment_id text,                                 -- dpl_...
  vercel_url           text,                                 -- <deploy>.vercel.app (sem https://)
  environment          text        NOT NULL DEFAULT 'development'
                       CHECK (environment IN ('production', 'preview', 'development')),
  db_migration_version text,                                 -- supabase_migrations.schema_migrations
  status               text        NOT NULL DEFAULT 'deployed'
                       CHECK (status IN ('deployed', 'rolled_back', 'superseded')),
  rolled_back_to       bigint      REFERENCES app_release (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  notes                text
);

CREATE UNIQUE INDEX IF NOT EXISTS app_release_deployment_uidx ON app_release (vercel_deployment_id);
CREATE INDEX IF NOT EXISTS app_release_env_created_idx ON app_release (environment, created_at DESC);
CREATE INDEX IF NOT EXISTS app_release_git_sha_idx ON app_release (git_sha);
CREATE INDEX IF NOT EXISTS app_release_rolled_back_to_idx ON app_release (rolled_back_to)
  WHERE rolled_back_to IS NOT NULL;

ALTER TABLE app_release ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_release FROM anon, authenticated;
REVOKE ALL ON SEQUENCE app_release_id_seq FROM anon, authenticated;

COMMENT ON TABLE app_release IS
  'Versões publicadas (deploys). Gravada no build da Vercel; usada por scripts/rollback.mjs.';
