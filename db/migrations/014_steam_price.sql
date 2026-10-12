-- Lista de desejos + preço atual da Steam.
--
-- ref_status: rótulo do status novo (criado em 20261012040000). Fica por último na ordem
-- e fora da fila.
INSERT INTO ref_status (code, label_pt, sort_order, queue_eligible)
VALUES ('wishlist', 'Desejado', 5, false)
ON CONFLICT (code) DO UPDATE SET label_pt = EXCLUDED.label_pt,
  sort_order = EXCLUDED.sort_order, queue_eligible = EXCLUDED.queue_eligible;

-- game_price: último preço conhecido de um app da Steam por país (catálogo global, como
-- game). Chave natural (app, país): uma linha por app, sobrescrita a cada atualização;
-- o histórico não é guardado. Valores em centavos da moeda (BRL para 'BR').
--   final_cents NULL  = sem preço à venda (lançamento futuro, removido da loja);
--   is_free           = gratuito (final_cents 0).
CREATE TABLE IF NOT EXISTS game_price (
  steam_app_id     integer  NOT NULL CHECK (steam_app_id > 0),
  country_code     char(2)  NOT NULL DEFAULT 'BR' CHECK (country_code ~ '^[A-Z]{2}$'),
  currency         char(3)  CHECK (currency ~ '^[A-Z]{3}$'),
  initial_cents    integer  CHECK (initial_cents >= 0),
  final_cents      integer  CHECK (final_cents >= 0),
  discount_percent smallint NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
  discount_ends_at timestamptz,
  is_free          boolean  NOT NULL DEFAULT false,
  formatted        text     CHECK (length(formatted) <= 40),
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (steam_app_id, country_code)
);
-- Atualização por TTL: "preços mais velhos que X" sem varrer a tabela.
CREATE INDEX IF NOT EXISTS game_price_fetched_idx ON game_price (fetched_at);

-- Lista de desejos do usuário (tela /desejos): filtra library_entry por status.
CREATE INDEX IF NOT EXISTS library_entry_user_wishlist_idx
  ON library_entry (user_id, created_at DESC) WHERE status = 'wishlist';

-- Mesmo padrão do catálogo (rls + hardening): leitura pública, escrita só pela API
-- (conexão direta, fora da RLS). Roles anon/authenticated só existem no Supabase.
ALTER TABLE game_price ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    DROP POLICY IF EXISTS game_price_read ON game_price;
    CREATE POLICY game_price_read ON game_price FOR SELECT TO anon, authenticated USING (true);
    REVOKE ALL ON game_price FROM anon, authenticated;
    GRANT SELECT ON game_price TO anon, authenticated;
  END IF;
END $$;
