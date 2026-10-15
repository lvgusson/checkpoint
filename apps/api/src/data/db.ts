// Conexão Postgres (Supabase) — singleton por processo/instância serverless.
//
// Driver `postgres` (porsager): tagged templates parametrizados, pipelining e pool próprio.
// DATABASE_URL aponta para o pooler Supavisor em modo TRANSAÇÃO (porta 6543): cada
// transação pode cair numa conexão de servidor diferente, então prepared statements
// nomeados são desligados (`prepare: false`). O pool local é pequeno porque, na Vercel,
// cada instância da função abre o seu — quem multiplexa de verdade é o Supavisor.
import postgres from 'postgres';

export type Sql = postgres.Sql;

let client: Sql | null = null;

export function db(url = process.env.DATABASE_URL): Sql {
  if (client) return client;
  if (!url) throw new Error('DATABASE_URL não definida');
  client = postgres(url, {
    prepare: false,
    max: Number(process.env.PG_POOL_MAX) || 5,
    idle_timeout: 20, // s: devolve conexões ociosas (instâncias serverless congeladas)
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    // `undefined` vira NULL em vez de lançar (campos opcionais vindos da API).
    transform: { undefined: null },
    connection: { application_name: 'checkpoint-api' },
    onnotice: () => {},
  });
  return client;
}

/** Fecha o pool (testes/scripts). Uma nova chamada a db() abre outro. */
export async function closeDb(): Promise<void> {
  const c = client;
  client = null;
  if (c) await c.end({ timeout: 5 });
}
