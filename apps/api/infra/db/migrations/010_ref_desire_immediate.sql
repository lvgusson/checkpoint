-- Rótulo e pontos da vontade "Imediata" (o valor do enum entrou em 20261012010000).
-- Peso neutro, igual a "Muito Alta": o topo da fila vem da ordenação, não do score.
-- sort_order 0 fica antes de 'very_high' (1). ref_desire.points tem CHECK 0..100: 100 cabe.
INSERT INTO ref_desire (code, label_pt, points, sort_order) VALUES
  ('immediate', 'Imediata', 100, 0)
ON CONFLICT (code) DO UPDATE SET label_pt = EXCLUDED.label_pt,
  points = EXCLUDED.points, sort_order = EXCLUDED.sort_order;
