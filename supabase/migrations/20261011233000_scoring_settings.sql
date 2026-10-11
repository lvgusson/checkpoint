-- Configuração do algoritmo por usuário (tela /configuracoes):
--   weights jsonb (já existia) = ScoreWeights;
--   rules   jsonb              = ScoringRules (regra -> ligada?); chaves ausentes = padrão da API;
--   version integer            = sobe a cada gravação (cache do navegador compara com ela).
-- A fila já é invalidada por trg_weights_bump (INSERT/UPDATE/DELETE sobem inputs_version).
-- ADD COLUMN com default constante é só metadado (sem reescrever a tabela).
ALTER TABLE user_score_weights
  ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'
    CONSTRAINT user_score_weights_rules_object CHECK (jsonb_typeof(rules) = 'object'),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1
    CONSTRAINT user_score_weights_version_positive CHECK (version > 0);
