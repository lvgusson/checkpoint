-- Filtros de conteúdo da fila (tela /configuracoes → Filtros):
--   filters jsonb = QueueFilters (gêneros/tags excluídos, lojas, ritmos, horas mín/máx,
--   sem tempo, só coop, vontade mínima). Chaves ausentes = padrão neutro da API.
-- ADD COLUMN com default constante é só metadado (sem reescrever a tabela).
ALTER TABLE user_score_weights
  ADD COLUMN IF NOT EXISTS filters jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT user_score_weights_filters_object CHECK (jsonb_typeof(filters) = 'object');
