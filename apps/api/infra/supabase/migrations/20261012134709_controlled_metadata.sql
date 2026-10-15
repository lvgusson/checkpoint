-- Complete controlled metadata catalogs without replacing compatibility-sensitive IDs.
BEGIN;

CREATE TABLE ref_pace (
  name text PRIMARY KEY,
  sort_order smallint NOT NULL DEFAULT 0
);
CREATE TABLE ref_structure (
  name text PRIMARY KEY,
  sort_order smallint NOT NULL DEFAULT 0
);
CREATE TABLE ref_platform (
  name text PRIMARY KEY,
  sort_order smallint NOT NULL DEFAULT 0
);

INSERT INTO ref_pace (name, sort_order) VALUES
  ('', 0), ('Calmo', 1), ('Moderado', 2), ('Frenético', 3);
INSERT INTO ref_structure (name, sort_order) VALUES
  ('', 0), ('Campanha', 1), ('Campanha + repetição', 2),
  ('Campanha + sandbox', 3), ('Coletânea', 4), ('Sem fim definido', 5);
INSERT INTO ref_platform (name, sort_order) VALUES
  ('', 0), ('PC', 1), ('PlayStation 5', 2), ('PlayStation 4', 3),
  ('Xbox Series X|S', 4), ('Xbox One', 5), ('Nintendo Switch', 6),
  ('Nintendo Switch 2', 7), ('Android', 8), ('iOS', 9);

-- Preserve uncommon existing values as explicit options rather than discarding metadata.
INSERT INTO ref_pace (name) SELECT DISTINCT btrim(pace) FROM game ON CONFLICT DO NOTHING;
UPDATE game SET pace = btrim(pace) WHERE pace IS DISTINCT FROM btrim(pace);
UPDATE game SET structure = CASE norm_key(replace(structure, ' ', ''))
  WHEN 'campanha+repeticao' THEN 'Campanha + repetição'
  WHEN 'campanha+sandbox' THEN 'Campanha + sandbox'
  ELSE btrim(structure) END
WHERE structure IS DISTINCT FROM CASE norm_key(replace(structure, ' ', ''))
  WHEN 'campanha+repeticao' THEN 'Campanha + repetição'
  WHEN 'campanha+sandbox' THEN 'Campanha + sandbox'
  ELSE btrim(structure) END;
INSERT INTO ref_structure (name) SELECT DISTINCT structure FROM game ON CONFLICT DO NOTHING;
UPDATE library_entry SET platform = btrim(platform) WHERE platform IS DISTINCT FROM btrim(platform);
INSERT INTO ref_platform (name) SELECT DISTINCT platform FROM library_entry ON CONFLICT DO NOTHING;
INSERT INTO store (name) VALUES ('Xbox'), ('PlayStation'), ('Nintendo'), ('Microsoft'), ('itch.io')
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE game ADD CONSTRAINT game_pace_catalog_fk FOREIGN KEY (pace) REFERENCES ref_pace (name);
ALTER TABLE game ADD CONSTRAINT game_structure_catalog_fk FOREIGN KEY (structure) REFERENCES ref_structure (name);
ALTER TABLE library_entry ADD CONSTRAINT library_entry_platform_catalog_fk FOREIGN KEY (platform) REFERENCES ref_platform (name);

ALTER TABLE ref_pace ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE ref_platform ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ref_pace, ref_structure, ref_platform FROM PUBLIC, anon, authenticated;

INSERT INTO schema_migration (version) VALUES ('016_controlled_metadata') ON CONFLICT DO NOTHING;
COMMIT;
