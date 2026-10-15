// Entry único da Vercel Function para a API (/api/*).
//
// É JavaScript puro de propósito: o runtime Node 24 da Vercel executa os
// arquivos .ts de api/src por "type stripping" nativo (igual ao `npm start`),
// então não dependemos da transpilação do @vercel/node (que não reescreve os
// imports com extensão .ts). Os fontes são incluídos via `includeFiles` no
// vercel.json, e só este arquivo é construído como função (bloco `builds`),
// evitando que api/src/** e api/test/** virem funções serverless.
//
// Persistência: com DATABASE_URL (produção) usa o Postgres do Supabase via pooler em
// modo transação. Sem DATABASE_URL cai nos JSON locais em /tmp (efêmero, por instância:
// edições se perdem) — só serve para previews sem banco. Ver docs/deploy.md.
// Imports explícitos das dependências usadas só pelos .ts: garantem que o trace de
// arquivos da Vercel (nft) as inclua no bundle da função.
import 'jose';
import 'postgres';
import '@vercel/functions';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from './src/server.ts';
import { createService } from './src/setup.ts';
import { authenticatorFromEnv } from './src/auth.ts';

const auth = authenticatorFromEnv();
const { service, wishlist } = await createService({
  dataDir: process.env.DATA_DIR ?? join(tmpdir(), 'checkpoint'),
});

// makeServer devolve um http.Server; reaproveitamos o listener dele sem listen().
const server = makeServer(service, auth, wishlist);

export default function handler(req, res) {
  server.emit('request', req, res);
}
