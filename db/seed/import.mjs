#!/usr/bin/env node
// Gera db/seed/seed.sql a partir de api/src/seed.ts (+ data/metadata/game-metadata.json, se existir).
// Não conecta no banco e não usa dependências npm. Node 24+ (type stripping para importar .ts).
//
// Uso:
//   node db/seed/import.mjs                 # insere o que falta (não sobrescreve edições já no banco)
//   node db/seed/import.mjs --force         # sobrescreve catálogo e biblioteca com o seed
//   node db/seed/import.mjs --out caminho.sql --user <uuid> --email voce@exemplo.com
//
// Depois: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/001_init.sql \
//           -f db/migrations/002_queue_snapshot.sql -f db/seed/seed.sql

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const FORCE = args.includes('--force');
const OUT = resolve(opt('--out', resolve(here, 'seed.sql')));
const USER_ID = opt('--user', '00000000-0000-4000-8000-000000000001');
const USER_EMAIL = opt('--email', null);
const METADATA = resolve(opt('--metadata', resolve(root, 'data/metadata/game-metadata.json')));

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(USER_ID))
  throw new Error('--user precisa ser um uuid');

const { seedGames } = await import(pathToFileURL(resolve(root, 'api/src/seed.ts')).href);
const { defaultWeights } = await import(pathToFileURL(resolve(root, 'api/src/scoring.ts')).href);

let metadata = [];
try {
  metadata = JSON.parse(await readFile(METADATA, 'utf8'));
  if (!Array.isArray(metadata)) throw new Error('game-metadata.json deve ser um array');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  console.warn(`[import] ${METADATA} não encontrado — seguindo sem metadados.`);
}

// ---------------------------------------------------------------- helpers SQL
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const t = (v) => `${q(v)}::text`;
const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v}::numeric` : 'NULL::numeric');
const int = (v) => (Number.isInteger(v) ? `${v}::integer` : 'NULL::integer');
const date = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
    ? `${q(v.slice(0, 10))}::date`
    : 'NULL::date';
const ts = (v) =>
  v && Number.isFinite(Date.parse(v))
    ? `${q(new Date(v).toISOString())}::timestamptz`
    : 'NULL::timestamptz';
const arr = (xs) =>
  `ARRAY[${(xs ?? [])
    .filter((x) => typeof x === 'string' && x.trim())
    .map(q)
    .join(',')}]::text[]`;
const json = (v) => `${q(JSON.stringify(v ?? {}))}::jsonb`;
const chunk = (xs, size = 200) => {
  const out = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

const statusCode = {
  'Não iniciado': 'not_started',
  Jogando: 'playing',
  Abandonado: 'abandoned',
  Finalizado: 'finished',
};
const desireCode = {
  'Muito Alta': 'very_high',
  Alta: 'high',
  Média: 'medium',
  Baixa: 'low',
  'Muito Baixa': 'very_low',
};
const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const slugify = (s) =>
  normal(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Slugs determinísticos e únicos (ordem por código)
const slugs = new Map();
const used = new Set();
for (const g of [...seedGames].sort((a, b) => a.id.localeCompare(b.id))) {
  let s = slugify(g.name) || g.id.toLowerCase();
  if (used.has(s)) s = `${s}-${g.id.toLowerCase()}`;
  used.add(s);
  slugs.set(g.id, s);
}

const uniq = (xs) => {
  const seen = new Map();
  for (const x of xs) if (x && x.trim() && !seen.has(normal(x))) seen.set(normal(x), x.trim());
  return [...seen.values()];
};

const sql = [];
const emit = (s) => sql.push(s);
const conflictGame = FORCE
  ? `ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name, primary_genre_id = EXCLUDED.primary_genre_id, mechanic_id = EXCLUDED.mechanic_id,
    pace = EXCLUDED.pace, structure = EXCLUDED.structure, coop = EXCLUDED.coop, size_label = EXCLUDED.size_label,
    main_hours = EXCLUDED.main_hours, extra_hours = EXCLUDED.extra_hours,
    completionist_hours = EXCLUDED.completionist_hours, previous_estimated_hours = EXCLUDED.previous_estimated_hours,
    time_verification = EXCLUDED.time_verification, time_source = EXCLUDED.time_source,
    review_notes = EXCLUDED.review_notes, steam_app_id = EXCLUDED.steam_app_id`
  : 'ON CONFLICT (code) DO NOTHING';

emit(`-- Gerado por db/seed/import.mjs em ${new Date().toISOString()}
-- Jogos: ${seedGames.length}; metadados: ${metadata.length}; modo: ${FORCE ? '--force (sobrescreve)' : 'insere faltantes'}
BEGIN;
SET LOCAL client_min_messages = warning;
`);

// ---------------------------------------------------------------- usuário + pesos
emit(`INSERT INTO app_user (id, email, display_name)
VALUES (${q(USER_ID)}::uuid, ${t(USER_EMAIL)}, 'Default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO game_list (user_id, name)
SELECT ${q(USER_ID)}::uuid, 'Principal'
 WHERE NOT EXISTS (SELECT 1 FROM game_list WHERE user_id = ${q(USER_ID)}::uuid);

INSERT INTO user_score_weights (list_id, user_id, weights)
SELECT l.id, l.user_id, ${json(defaultWeights)} FROM game_list l
 WHERE l.user_id = ${q(USER_ID)}::uuid ORDER BY l.created_at, l.id LIMIT 1
ON CONFLICT (list_id) DO NOTHING;
`);

// ---------------------------------------------------------------- vocabulários
const vocab = (table, values) => {
  const vs = uniq(values);
  if (vs.length)
    emit(
      `INSERT INTO ${table} (name) VALUES\n  ${vs.map((v) => `(${q(v)})`).join(',\n  ')}\nON CONFLICT (key) DO NOTHING;\n`,
    );
};
vocab(
  'genre',
  seedGames.map((g) => g.primaryGenre),
);
vocab(
  'mechanic',
  seedGames.map((g) => g.mechanic),
);
vocab(
  'tag',
  seedGames.flatMap((g) => g.secondaryTags),
);
vocab(
  'store',
  seedGames.map((g) => g.store),
);

// ---------------------------------------------------------------- game (catálogo)
for (const part of chunk(seedGames)) {
  emit(`INSERT INTO game (code, slug, name, primary_genre_id, mechanic_id, pace, structure, coop, size_label,
  main_hours, extra_hours, completionist_hours, previous_estimated_hours,
  time_verification, time_source, review_notes, steam_app_id)
SELECT v.code, v.slug, v.name, ge.id, me.id, v.pace, v.structure, v.coop, v.size_label,
  v.main_hours, v.extra_hours, v.completionist_hours, v.previous_estimated_hours,
  v.time_verification, v.time_source, v.review_notes, v.steam_app_id
FROM (VALUES
  ${part
    .map((g) =>
      [
        t(g.id),
        t(slugs.get(g.id)),
        t(g.name),
        t(g.primaryGenre),
        t(g.mechanic),
        t(g.pace ?? ''),
        t(g.structure ?? ''),
        t(g.coop ?? ''),
        t(g.size ?? ''),
        n(g.mainHours),
        n(g.extraHours),
        n(g.completionistHours),
        n(g.previousEstimatedHours),
        t(g.timeVerification ?? ''),
        t(g.timeSource ?? ''),
        t(g.reviewNotes ?? ''),
        int(g.steamAppId),
      ].join(', '),
    )
    .map((r) => `(${r})`)
    .join(',\n  ')}
) AS v(code, slug, name, genre, mechanic, pace, structure, coop, size_label,
       main_hours, extra_hours, completionist_hours, previous_estimated_hours,
       time_verification, time_source, review_notes, steam_app_id)
LEFT JOIN genre ge ON ge.key = norm_key(v.genre)
LEFT JOIN mechanic me ON me.key = norm_key(v.mechanic)
${conflictGame};
`);
}

// Pré-requisitos (segunda passada: todos os jogos já existem)
const prereqs = seedGames.filter((g) => g.prerequisiteId);
if (prereqs.length)
  emit(`UPDATE game g SET prerequisite_game_id = p.id
FROM (VALUES
  ${prereqs.map((g) => `(${t(g.id)}, ${t(g.prerequisiteId)})`).join(',\n  ')}
) AS v(code, prereq_code)
JOIN game p ON p.code = v.prereq_code
WHERE g.code = v.code AND g.prerequisite_game_id IS DISTINCT FROM p.id
  ${FORCE ? '' : 'AND g.prerequisite_game_id IS NULL'};
`);

// Tags (fonte da verdade = game_tag; triggers preenchem game.tag_ids/tag_names)
const tagRows = seedGames.flatMap((g) =>
  uniq(g.secondaryTags).map((tag, i) => `(${t(g.id)}, ${t(tag)}, ${i + 1})`),
);
if (FORCE)
  emit(
    `DELETE FROM game_tag WHERE game_id IN (SELECT id FROM game WHERE code IN (${seedGames.map((g) => q(g.id)).join(',')}));\n`,
  );
for (const part of chunk(tagRows, 500))
  emit(`INSERT INTO game_tag (game_id, tag_id, position)
SELECT g.id, tg.id, v.position
FROM (VALUES
  ${part.join(',\n  ')}
) AS v(code, tag, position)
JOIN game g ON g.code = v.code
JOIN tag tg ON tg.key = norm_key(v.tag)
${FORCE ? '' : 'WHERE NOT EXISTS (SELECT 1 FROM game_tag x WHERE x.game_id = g.id)'}
ON CONFLICT (game_id, tag_id) DO NOTHING;
`);

// ---------------------------------------------------------------- library_entry
const conflictEntry = FORCE
  ? `ON CONFLICT (user_id, game_id) DO UPDATE SET
    status = EXCLUDED.status, desire = EXCLUDED.desire, store_id = EXCLUDED.store_id, platform = EXCLUDED.platform,
    actual_hours = EXCLUDED.actual_hours, started_at = EXCLUDED.started_at, finished_at = EXCLUDED.finished_at,
    rating = EXCLUDED.rating, notes = EXCLUDED.notes, steam_hours = EXCLUDED.steam_hours,
    steam_updated_at = EXCLUDED.steam_updated_at, imported = EXCLUDED.imported`
  : 'ON CONFLICT (user_id, game_id) DO NOTHING';

for (const part of chunk(seedGames)) {
  emit(`INSERT INTO library_entry (user_id, game_id, status, desire, store_id, platform, actual_hours,
  started_at, finished_at, rating, notes, steam_hours, steam_updated_at, imported, created_at, updated_at)
SELECT ${q(USER_ID)}::uuid, g.id, v.status::game_status, v.desire::desire_level, st.id, v.platform, v.actual_hours,
  v.started_at, v.finished_at, v.rating, v.notes, v.steam_hours, v.steam_updated_at, v.imported,
  coalesce(v.updated_at, now()), coalesce(v.updated_at, now())
FROM (VALUES
  ${part
    .map((g) => {
      if (!statusCode[g.status]) throw new Error(`Status desconhecido em ${g.id}: ${g.status}`);
      if (!desireCode[g.desire]) throw new Error(`Vontade desconhecida em ${g.id}: ${g.desire}`);
      return `(${[
        t(g.id),
        t(statusCode[g.status]),
        t(desireCode[g.desire]),
        t(g.store),
        t(g.platform || 'PC'),
        n(g.actualHours),
        date(g.startedAt),
        date(g.finishedAt),
        n(g.rating),
        t(g.notes ?? ''),
        n(g.steamHours),
        ts(g.steamUpdatedAt),
        json(g.imported),
        ts(g.updatedAt),
      ].join(', ')})`;
    })
    .join(',\n  ')}
) AS v(code, status, desire, store, platform, actual_hours, started_at, finished_at, rating, notes,
       steam_hours, steam_updated_at, imported, updated_at)
JOIN game g ON g.code = v.code
LEFT JOIN store st ON st.key = norm_key(v.store)
${conflictEntry};
`);
}

// ---------------------------------------------------------------- metadados
const known = new Set(seedGames.map((g) => g.id));
const metaOk = metadata.filter((m) => m && known.has(m.gameId));
const skipped = metadata.length - metaOk.length;
if (skipped)
  console.warn(
    `[import] ${skipped} registro(s) de metadados com gameId desconhecido foram ignorados.`,
  );

const parseRelease = (v) => {
  if (!v || typeof v !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (/^\d{4}$/.test(v.trim())) return null; // só ano: fica em release_date_text/release_year
  const d = Date.parse(v);
  return Number.isFinite(d)
    ? new Date(d - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    : null;
};
const conf = (c) => (['high', 'medium', 'low'].includes(c) ? c : 'low');
const lang = (l) => (['pt-BR', 'en'].includes(l) ? l : null);
const url = (u) => (typeof u === 'string' && u.trim() ? u.trim() : null);

for (const part of chunk(metaOk, 100)) {
  emit(`INSERT INTO game_metadata (game_id, matched_title, steam_app_id, cover_url, header_url, hero_url,
  short_description, description, description_lang, release_date, release_date_text,
  developers, publishers, source_genres, confidence, notes, fetched_at)
SELECT g.id, v.matched_title, v.steam_app_id, v.cover_url, v.header_url, v.hero_url,
  v.short_description, v.description, v.description_lang, v.release_date, v.release_date_text,
  v.developers, v.publishers, v.source_genres, v.confidence::metadata_confidence, v.notes, v.fetched_at
FROM (VALUES
  ${part
    .map(
      (m) =>
        `(${[
          t(m.gameId),
          t(m.matchedTitle ?? null),
          int(m.steamAppId),
          t(url(m.coverUrl)),
          t(url(m.headerUrl)),
          t(url(m.heroUrl)),
          t(m.shortDescription ?? null),
          t(m.description ?? null),
          t(lang(m.descriptionLang)),
          date(parseRelease(m.releaseDate)),
          t(m.releaseDate ?? null),
          arr(m.developers),
          arr(m.publishers),
          arr(m.sourceGenres),
          t(conf(m.confidence)),
          t(m.notes ?? ''),
          ts(m.fetchedAt) === 'NULL::timestamptz' ? 'now()' : ts(m.fetchedAt),
        ].join(', ')})`,
    )
    .join(',\n  ')}
) AS v(code, matched_title, steam_app_id, cover_url, header_url, hero_url, short_description, description,
       description_lang, release_date, release_date_text, developers, publishers, source_genres,
       confidence, notes, fetched_at)
JOIN game g ON g.code = v.code
ON CONFLICT (game_id) DO UPDATE SET
  matched_title = EXCLUDED.matched_title, steam_app_id = EXCLUDED.steam_app_id,
  cover_url = EXCLUDED.cover_url, header_url = EXCLUDED.header_url, hero_url = EXCLUDED.hero_url,
  short_description = EXCLUDED.short_description, description = EXCLUDED.description,
  description_lang = EXCLUDED.description_lang, release_date = EXCLUDED.release_date,
  release_date_text = EXCLUDED.release_date_text, developers = EXCLUDED.developers,
  publishers = EXCLUDED.publishers, source_genres = EXCLUDED.source_genres,
  confidence = EXCLUDED.confidence, notes = EXCLUDED.notes, fetched_at = EXCLUDED.fetched_at;
`);
}

if (metaOk.length) {
  const codes = metaOk.map((m) => q(m.gameId)).join(',');
  emit(`-- Filhos dos metadados: substitui o conjunto inteiro (a fonte manda a lista completa)
DELETE FROM game_screenshot      WHERE game_id IN (SELECT id FROM game WHERE code IN (${codes}));
DELETE FROM game_trailer         WHERE game_id IN (SELECT id FROM game WHERE code IN (${codes}));
DELETE FROM game_metadata_source WHERE game_id IN (SELECT id FROM game WHERE code IN (${codes}));
`);
  const child = (table, cols, rows) => {
    for (const part of chunk(rows, 500))
      emit(`INSERT INTO ${table} (game_id, ${cols.join(', ')})
SELECT g.id, ${cols.map((c) => `v.${c}`).join(', ')}
FROM (VALUES
  ${part.join(',\n  ')}
) AS v(code, ${cols.join(', ')})
JOIN game g ON g.code = v.code
ON CONFLICT DO NOTHING;
`);
  };
  child(
    'game_screenshot',
    ['position', 'thumb_url', 'full_url'],
    metaOk.flatMap((m) =>
      (m.screenshots ?? [])
        .filter((s) => url(s?.fullUrl) || url(s?.thumbUrl))
        .map(
          (s, i) =>
            `(${t(m.gameId)}, ${int(Number.isInteger(s.position) ? s.position : i)}::smallint, ${t(url(s.thumbUrl) ?? url(s.fullUrl))}, ${t(url(s.fullUrl) ?? url(s.thumbUrl))})`,
        ),
    ),
  );
  child(
    'game_trailer',
    ['position', 'name', 'thumb_url', 'url'],
    metaOk.flatMap((m) =>
      (m.trailers ?? [])
        .filter((tr) => url(tr?.url))
        .map(
          (tr, i) =>
            `(${t(m.gameId)}, ${i}::smallint, ${t(tr.name ?? '')}, ${t(url(tr.thumbUrl))}, ${t(url(tr.url))})`,
        ),
    ),
  );
  child(
    'game_metadata_source',
    ['position', 'kind', 'url'],
    metaOk.flatMap((m) =>
      (m.sources ?? [])
        .filter((s) => url(s?.url))
        .map(
          (s, i) => `(${t(m.gameId)}, ${i}::smallint, ${t(s.kind || 'unknown')}, ${t(url(s.url))})`,
        ),
    ),
  );
}

emit(`-- Sanidade
DO $$
DECLARE n_games int; n_entries int;
BEGIN
  SELECT count(*) INTO n_games FROM game WHERE code IN (${seedGames.map((g) => q(g.id)).join(',')});
  SELECT count(*) INTO n_entries FROM library_entry WHERE user_id = ${q(USER_ID)}::uuid;
  IF n_games <> ${seedGames.length} THEN
    RAISE EXCEPTION 'esperado ${seedGames.length} jogos, encontrado %', n_games;
  END IF;
  RAISE NOTICE 'seed ok: % jogos, % entradas na biblioteca', n_games, n_entries;
END $$;

COMMIT;
`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, sql.join('\n'), 'utf8');
console.log(
  `[import] ${OUT} gerado: ${seedGames.length} jogos, ${tagRows.length} tags, ${metaOk.length} metadados.`,
);
