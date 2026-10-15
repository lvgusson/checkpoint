-- 1) Vontade "Imediata", acima de "Muito Alta": vai para o topo da fila por pontuação.
--    BEFORE 'very_high' mantém ORDER BY desire com ela primeiro. O valor novo só pode ser
--    usado depois do COMMIT desta migration, por isso a linha de ref_desire fica em
--    20261012010001_ref_desire_immediate.sql.
ALTER TYPE desire_level ADD VALUE IF NOT EXISTS 'immediate' BEFORE 'very_high';

-- 2) Reordenação manual vira posição fixa (pin): o jogo fica exatamente onde o usuário soltou.
--
-- queue_manual_adjustment.manual_position passa a ser o pin (NULL = sem pin) e flat_points
-- deixa de ser usado (sempre 0). A fila exibida é calculada em memória: fila por pontuação
-- sem os fixados + fixados inseridos na posição. last_moved_at desempata dois pins na mesma
-- posição (o mais recente fica nela). queue_move_event continua sendo a auditoria
-- (kind 'move' com points_delta 0; client_request_id torna a gravação idempotente).
--
-- Conversão dos ajustes antigos: quem tinha pontos vira pin na última posição pedida;
-- linhas cujo ajuste já tinha voltado a 0 perdem a posição (não eram ajuste ativo).
UPDATE queue_manual_adjustment
   SET manual_position = NULL
 WHERE flat_points = 0 AND manual_position IS NOT NULL;

UPDATE queue_manual_adjustment
   SET flat_points = 0
 WHERE flat_points <> 0;

COMMENT ON COLUMN queue_manual_adjustment.manual_position IS
  'Pin: posição fixada pelo usuário na fila (NULL = sem pin).';
COMMENT ON COLUMN queue_manual_adjustment.flat_points IS
  'Legado (pontos manuais, antes dos pins); sempre 0.';
