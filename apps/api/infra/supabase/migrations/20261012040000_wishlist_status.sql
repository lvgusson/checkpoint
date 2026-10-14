-- Lista de desejos: um jogo desejado é um library_entry normal com status 'wishlist'
-- ("Desejado" na API). Fica fora da fila porque is_queue_candidate só aceita
-- not_started/playing. Quando o jogo é comprado, basta mudar o status.
--
-- ALTER TYPE ... ADD VALUE fica sozinho nesta migration: o valor novo não pode ser
-- usado na mesma transação em que foi criado (a linha de ref_status vai na próxima).
ALTER TYPE game_status ADD VALUE IF NOT EXISTS 'wishlist';
