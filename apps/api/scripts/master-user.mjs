// Provision an ordinary account, store credentials in ignored local-env.env, and copy missing seed-library entries. --reset clears only that account.
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';

const ENV_FILE = 'local-env.env';
const SEED_APP_USER_ID = '00000000-0000-4000-8000-000000000001';
const env = process.env;
const email = env.MASTER_EMAIL || 'master@gps.dev.br';
const reset = process.argv.includes('--reset');

for (const k of [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'DATABASE_URL',
])
  if (!env[k]) throw new Error(`Defina ${k}`);

const admin = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
  'Content-Type': 'application/json',
};
const auth = (path, init = {}) =>
  fetch(env.SUPABASE_URL + '/auth/v1' + path, { ...init, headers: admin });

/** Persist MASTER_* values in the ignored local environment file. */
function saveEnv(values) {
  let lines = [];
  try {
    lines = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  } catch {
    // Create the file when absent.
  }
  lines = lines.filter((l) => !Object.keys(values).some((k) => l.startsWith(k + '=')));
  while (lines.length && lines.at(-1) === '') lines.pop();
  lines.push(...Object.entries(values).map(([k, v]) => `${k}=${v}`), '');
  writeFileSync(ENV_FILE, lines.join('\r\n'));
}

const password = env.MASTER_PASSWORD || randomBytes(18).toString('base64url');
let res = await auth('/admin/users', {
  method: 'POST',
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: 'master' },
  }),
});
let user = await res.json();
if (!res.ok) {
  // Find the account and confirm its email and password.
  const list = await (await auth('/admin/users?per_page=1000')).json();
  const found = (list.users ?? []).find((u) => u.email === email);
  if (!found) throw new Error(`Falha ao criar ${email}: ${user.msg ?? user.message ?? res.status}`);
  res = await auth('/admin/users/' + found.id, {
    method: 'PUT',
    body: JSON.stringify({ password, email_confirm: true }),
  });
  user = await res.json();
  if (!res.ok) throw new Error(`Falha ao atualizar ${email}: ${res.status}`);
  console.log('Conta master já existia: senha confirmada.');
} else console.log('Conta master criada.');
saveEnv({ MASTER_LOGIN: 'master', MASTER_EMAIL: email, MASTER_PASSWORD: password });

// Insert the ordinary owner and copy missing library entries in one transaction.
const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO app_user (id, auth_user_id, email, display_name)
      VALUES (${user.id}, ${user.id}, ${email}, 'master')
      ON CONFLICT (id) DO NOTHING`;
    if (reset) {
      await tx`DELETE FROM game_list WHERE user_id = ${user.id}`;
      await tx`DELETE FROM library_entry WHERE user_id = ${user.id}`;
    }
    const copied = await tx`
      INSERT INTO library_entry (user_id, game_id, status, desire, store_id, platform, actual_hours,
                                 started_at, finished_at, rating, notes, steam_hours,
                                 steam_updated_at, imported)
      SELECT ${user.id}, e.game_id, e.status, e.desire, e.store_id, e.platform, e.actual_hours,
             e.started_at, e.finished_at, e.rating, e.notes, e.steam_hours, e.steam_updated_at,
             e.imported
        FROM library_entry e
       WHERE e.user_id = ${SEED_APP_USER_ID}
         AND NOT EXISTS (SELECT 1 FROM library_entry m
                          WHERE m.user_id = ${user.id} AND m.game_id = e.game_id)`;
    console.log(`Biblioteca: ${copied.count} jogos copiados para a master.`);
  });
} finally {
  await sql.end();
}

const login = await fetch(env.SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
console.log('Login de teste:', login.ok ? 'ok' : `falhou (${login.status})`);
console.log(`Credenciais em ${ENV_FILE}: MASTER_LOGIN, MASTER_EMAIL, MASTER_PASSWORD.`);
