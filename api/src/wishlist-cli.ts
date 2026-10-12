// Lista de desejos da Steam do dono do seed.
//   npm run wishlist:import            importa direto da Steam (banco ou JSON local)
//   npm run wishlist:export            grava o snapshot da Steam em data/wishlist/steam-wishlist.json
//   npm run wishlist:seed              importa do snapshot (sem chamar a Steam; idempotente)
// Opções:
//   --dry-run        só consulta a Steam e mostra o que seria criado (não grava nada)
//   --json           grava nos JSON locais (api/data) mesmo com DATABASE_URL
//   --profile <p>    SteamID64, URL do perfil ou nome personalizado (padrão: STEAM_PROFILE)
//   --export [file]  grava o snapshot (apps com tags, imagens e preço) e sai
//   --from [file]    importa do snapshot em vez da Steam
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_APP_USER_ID } from './app-user.ts';
import { createService } from './setup.ts';
import type { SteamApp } from '../../shared/models.ts';
import { SteamClient, steamClientFromEnv, steamProfileFromEnv } from './steam.ts';
import { gameFromSteamApp } from './steam-mapping.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const SNAPSHOT = resolve(root, 'data/wishlist/steam-wishlist.json');
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const next = args[i + 1];
  return next && !next.startsWith('--') ? next : fallback;
};
const profile = option('--profile') ?? steamProfileFromEnv();
const money = (cents: number | null) =>
  cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

interface Snapshot {
  steamId: string;
  exportedAt: string;
  appIds: number[];
  apps: SteamApp[];
}

/** Steam "congelada": responde a importação a partir do snapshot, sem rede. */
class SnapshotSteam extends SteamClient {
  private snap: Snapshot;
  constructor(snap: Snapshot) {
    super();
    this.snap = snap;
  }
  override async resolveSteamId() {
    return this.snap.steamId;
  }
  override async wishlist() {
    return this.snap.appIds;
  }
  override async apps(appIds: number[]) {
    const wanted = new Set(appIds);
    return this.snap.apps.filter((a) => wanted.has(a.appId));
  }
}

process.on('uncaughtException', (e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});

async function fetchFromSteam() {
  const steam = steamClientFromEnv();
  const steamId = await steam.resolveSteamId(profile);
  const appIds = await steam.wishlist(steamId);
  return { steamId, appIds, apps: await steam.apps(appIds) };
}

if (flag('--dry-run')) {
  const { appIds, apps } = await fetchFromSteam();
  console.log(`Lista de desejos: ${appIds.length} itens`);
  console.log(`Encontrados na loja: ${apps.length}`);
  const onSale = apps.filter((a) => a.price && a.price.discountPercent > 0);
  console.log(`Em promoção agora: ${onSale.length}`);
  for (const a of apps.slice(0, 5)) {
    const g = gameFromSteamApp(a);
    console.log(
      `- ${a.name} | ${g.primaryGenre} | ${g.secondaryTags.join(', ')} | ` +
        (a.price
          ? `${a.price.currency} ${money(a.price.finalCents)}` +
            (a.price.discountPercent ? ` (-${a.price.discountPercent}%)` : '')
          : 'sem preço'),
    );
  }
} else if (flag('--export')) {
  const file = resolve(option('--export', SNAPSHOT)!);
  const { steamId, appIds, apps } = await fetchFromSteam();
  const snap: Snapshot = { steamId, exportedAt: new Date().toISOString(), appIds, apps };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(snap, null, 2) + '\n');
  console.log(`Snapshot: ${apps.length}/${appIds.length} apps em ${file}`);
} else {
  const from = flag('--from') ? resolve(option('--from', SNAPSHOT)!) : null;
  const steam = from
    ? new SnapshotSteam(JSON.parse(await readFile(from, 'utf8')) as Snapshot)
    : undefined;
  const env = flag('--json') ? { ...process.env, DATABASE_URL: undefined } : process.env;
  const { wishlist, storage } = await createService({
    env,
    dataDir: resolve(root, 'api/data'),
    devAppUserId: SEED_APP_USER_ID,
    steam,
  });
  const result = await wishlist.importSteam({ profile: from ? 'snapshot' : profile });
  console.log(`(${storage}${from ? ', snapshot' : ''})`, JSON.stringify(result, null, 2));
  process.exit(0);
}
