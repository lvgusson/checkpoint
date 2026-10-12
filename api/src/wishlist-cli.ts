// Importa a lista de desejos da Steam para o dono do seed (npm run wishlist:import).
//   --dry-run        só consulta a Steam e mostra o que seria criado (não grava nada)
//   --json           grava nos JSON locais (api/data) mesmo com DATABASE_URL
//   --profile <p>    SteamID64, URL do perfil ou nome personalizado (padrão: STEAM_PROFILE)
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_APP_USER_ID } from './app-user.ts';
import { createService } from './setup.ts';
import { steamClientFromEnv, steamProfileFromEnv } from './steam.ts';
import { gameFromSteamApp } from './steam-mapping.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const profile = option('--profile') ?? steamProfileFromEnv();
const money = (cents: number | null) =>
  cents === null ? '—' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

process.on('uncaughtException', (e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});

if (flag('--dry-run')) {
  const steam = steamClientFromEnv();
  const steamId = await steam.resolveSteamId(profile);
  const appIds = await steam.wishlist(steamId);
  console.log(`Lista de desejos: ${appIds.length} itens`);
  const apps = await steam.apps(appIds);
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
} else {
  const env = flag('--json') ? { ...process.env, DATABASE_URL: undefined } : process.env;
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { wishlist, storage } = await createService({
    env,
    dataDir: resolve(root, 'api/data'),
    devAppUserId: SEED_APP_USER_ID,
  });
  const result = await wishlist.importSteam({ profile });
  console.log(`(${storage})`, JSON.stringify(result, null, 2));
  process.exit(0);
}
