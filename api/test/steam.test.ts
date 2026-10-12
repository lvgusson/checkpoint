import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { retry } from '../src/retry.ts';
import { SteamClient, SteamError, parseSteamProfile } from '../src/steam.ts';
import {
  coopFromTags,
  gameFromSteamApp,
  primaryGenreFromTags,
  structureFromTags,
} from '../src/steam-mapping.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { LocalWishlistStore } from '../src/wishlist-repository.ts';
import { GameService } from '../src/service.ts';
import { WishlistService } from '../src/wishlist.ts';
import { makeServer } from '../src/server.ts';
import { seedGames } from '../src/seed.ts';
import type {
  Recommendations,
  SteamApp,
  SteamSearchItem,
  WishlistImportResult,
  WishlistItem,
} from '../../shared/models.ts';

const KEY = 'SECRETKEY123';
const TAGS = [
  { tagid: 1, name: 'Metroidvania' },
  { tagid: 2, name: 'Indie' },
  { tagid: 3, name: 'Soulslike' },
  { tagid: 4, name: 'Plataforma 2D' },
  { tagid: 5, name: 'Exploração' },
  { tagid: 6, name: 'Cooperativo On-line' },
];
const ITEMS: Record<number, object> = {
  10: {
    id: 10,
    appid: 10,
    success: 1,
    name: 'Jogo Dez',
    tagids: [1, 2, 3, 4, 5],
    basic_info: { short_description: 'Descrição dez', developers: [{ name: 'Dev' }] },
    assets: { asset_url_format: 'steam/apps/10/${FILENAME}?t=1', header: 'h/header.jpg' },
    release: { steam_release_date: 1487959251 },
    best_purchase_option: {
      final_price_in_cents: '2500',
      original_price_in_cents: '10000',
      discount_pct: 75,
      formatted_final_price: 'R$25,00',
      active_discounts: [{ discount_end_date: 1792688400 }],
    },
  },
  20: { id: 20, appid: 20, success: 1, name: 'Grátis', is_free: true, tagids: [6] },
  30: { id: 30, appid: 30, success: 1, name: 'Em breve', tagids: [] },
  40: { id: 40, success: 15 },
};

interface MockOptions {
  wishlist?: number[];
  failTimes?: number;
  status?: number;
}
/** fetch falso da Steam; registra as URLs chamadas. */
function mockFetch({ wishlist = [10, 20, 40], failTimes = 0, status = 500 }: MockOptions = {}) {
  const calls: string[] = [];
  let failures = 0;
  const json = (body: unknown, s = 200) =>
    new Response(JSON.stringify(body), {
      status: s,
      headers: { 'content-type': 'application/json' },
    });
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    if (failures < failTimes) {
      failures++;
      return json({}, status);
    }
    if (url.pathname === '/api/storesearch/')
      return json({
        items: [
          {
            type: 'app',
            id: 10,
            name: 'Jogo Dez',
            price: { currency: 'BRL', initial: 10000, final: 2500 },
          },
          { type: 'sub', id: 99, name: 'Pacote' },
        ],
      });
    if (url.pathname.startsWith('/IStoreService/GetTagList'))
      return json({ response: { tags: TAGS } });
    if (url.pathname.startsWith('/IStoreBrowseService/GetItems')) {
      const input = JSON.parse(url.searchParams.get('input_json')!);
      return json({
        response: {
          store_items: input.ids.map(
            (i: { appid: number }) => ITEMS[i.appid] ?? { id: i.appid, success: 15 },
          ),
        },
      });
    }
    if (url.pathname.startsWith('/ISteamUser/ResolveVanityURL'))
      return json({
        response:
          url.searchParams.get('vanityurl') === 'fulano'
            ? { success: 1, steamid: '76561198000000001' }
            : { success: 42 },
      });
    if (url.pathname.startsWith('/IWishlistService/GetWishlist'))
      return json({
        response: {
          items: wishlist.map((appid, i) => ({ appid, priority: wishlist.length - i })),
        },
      });
    return json({}, 404);
  }) as typeof fetch;
  return { fn, calls };
}
const instant = async () => {};
const client = (opts?: MockOptions) => {
  const mock = mockFetch(opts);
  return { steam: new SteamClient({ apiKey: KEY, fetch: mock.fn, sleep: instant }), ...mock };
};

test('retry: 5 tentativas com esperas 200, 400, 800 e 1600 ms por padrão', async () => {
  const waits: number[] = [];
  let calls = 0;
  await assert.rejects(
    retry(
      async () => {
        calls++;
        throw new Error('x');
      },
      { sleep: async (ms) => void waits.push(ms) },
    ),
    /x/,
  );
  assert.equal(calls, 5);
  assert.deepEqual(waits, [200, 400, 800, 1600]);
  let n = 0;
  assert.equal(
    await retry(async () => (++n < 3 ? Promise.reject(new Error()) : 'ok'), { sleep: instant }),
    'ok',
  );
  let m = 0;
  await assert.rejects(
    retry(async () => (m++, Promise.reject(new Error())), { shouldRetry: () => false }),
  );
  assert.equal(m, 1);
});

test('perfil: SteamID64, URL e nome personalizado', () => {
  assert.deepEqual(parseSteamProfile('76561198000000001'), { steamId: '76561198000000001' });
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/profiles/76561198000000001/'), {
    steamId: '76561198000000001',
  });
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/id/fulano'), { vanity: 'fulano' });
  assert.deepEqual(parseSteamProfile('fulano'), { vanity: 'fulano' });
  assert.equal(parseSteamProfile(''), null);
  assert.equal(parseSteamProfile('a b c'), null);
});

test('cliente: busca por nome, detalhes em lote, preços e tags pt-BR', async () => {
  const { steam, calls } = client();
  const found: SteamSearchItem[] = await steam.search('jogo');
  assert.deepEqual(
    found.map((f) => [f.appId, f.price?.discountPercent]),
    [[10, 75]],
  );
  const apps = await steam.apps([10, 20, 30, 40, 10]);
  assert.deepEqual(
    apps.map((a) => a.appId),
    [10, 20, 30],
  );
  const [dez, free, soon] = apps;
  assert.deepEqual(dez.tags, ['Metroidvania', 'Indie', 'Soulslike', 'Plataforma 2D', 'Exploração']);
  assert.equal(
    dez.headerUrl,
    'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/10/h/header.jpg?t=1',
  );
  assert.equal(dez.releaseDate, '2017-02-24');
  assert.deepEqual(
    [
      dez.price?.currency,
      dez.price?.initialCents,
      dez.price?.finalCents,
      dez.price?.discountPercent,
    ],
    ['BRL', 10000, 2500, 75],
  );
  assert.equal(dez.price?.discountEndsAt, '2026-10-22T17:00:00.000Z');
  assert.equal(free.price?.isFree, true);
  assert.equal(free.price?.finalCents, 0);
  assert.equal(soon.price, null);
  // Uma chamada de GetItems para os 4 ids distintos; lista de tags em cache.
  assert.equal(calls.filter((c) => c.includes('GetItems')).length, 1);
  await steam.apps([10]);
  assert.equal(calls.filter((c) => c.includes('GetTagList')).length, 1);
});

test('cliente: retry em 5xx, sem retry em 4xx e a chave nunca aparece no erro', async () => {
  const ok = client({ failTimes: 2 });
  assert.equal((await ok.steam.search('x')).length, 1);
  assert.equal(ok.calls.length, 3);
  const bad = client({ failTimes: 9, status: 403 });
  const err = await bad.steam.resolveSteamId('fulano').catch((e: unknown) => e);
  assert(err instanceof SteamError);
  assert.equal(err.status, 403);
  assert.equal(bad.calls.length, 1);
  assert(!err.message.includes(KEY));
  const down = client({ failTimes: 9 });
  const e2 = await down.steam.resolveSteamId('fulano').catch((e: unknown) => e);
  assert(e2 instanceof SteamError);
  assert(!e2.message.includes(KEY) && !e2.message.includes('http'));
});

test('cliente: resolve nome personalizado e lê a lista de desejos por prioridade', async () => {
  const { steam } = client({ wishlist: [30, 10] });
  assert.equal(await steam.resolveSteamId('fulano'), '76561198000000001');
  await assert.rejects(steam.resolveSteamId('ninguem'), (e: SteamError) => e.status === 404);
  assert.deepEqual(await steam.wishlist('76561198000000001'), [10, 30]);
  const noKey = new SteamClient({ fetch: mockFetch().fn });
  await assert.rejects(noKey.resolveSteamId('fulano'), /STEAM_API_KEY/);
  assert.equal(await noKey.resolveSteamId('76561198000000001'), '76561198000000001');
});

test('mapeamento das tags da Steam para os campos do jogo', () => {
  assert.equal(primaryGenreFromTags(['Indie', 'Ação', 'Metroidvania']), 'Metroidvania');
  assert.equal(primaryGenreFromTags(['Indie', 'Ação']), 'Ação e aventura');
  assert.equal(primaryGenreFromTags(['Tiro em Primeira Pessoa (FPS)']), 'FPS');
  assert.equal(primaryGenreFromTags(['Algo Novo']), 'Algo Novo');
  assert.equal(coopFromTags(['Cooperativo Local', 'Cooperativo On-line']), 'Local e online');
  assert.equal(coopFromTags([]), 'Não');
  assert.equal(structureFromTags(['MMORPG']), 'Sem fim definido');
  assert.equal(structureFromTags(['Roguelite']), 'Campanha + repetição');
  const app: SteamApp = {
    appId: 10,
    name: ' Jogo ',
    shortDescription: '',
    tags: ['Indie', 'Metroidvania', 'Plataforma 2D', 'Soulslike', 'Exploração', 'Terror'],
    developers: [],
    publishers: [],
    releaseDate: null,
    headerUrl: null,
    capsuleUrl: null,
    heroUrl: null,
    storeUrl: '',
    price: null,
  };
  const g = gameFromSteamApp(app);
  assert.equal(g.name, 'Jogo');
  assert.equal(g.status, 'Desejado');
  assert.equal(g.desire, 'Média');
  assert.equal(g.store, 'Steam');
  assert.equal(g.primaryGenre, 'Metroidvania');
  assert.deepEqual(g.secondaryTags, ['Plataforma 2D', 'Soulslike', 'Exploração']);
});

async function setup(opts?: MockOptions) {
  const dir = await mkdtemp(join(tmpdir(), 'wishlist-'));
  const games = new LocalGameRepository(seedGames, join(dir, 'games.json'));
  const service = new GameService(games);
  const { steam, calls } = client(opts);
  const store = new LocalWishlistStore(games, join(dir, 'wishlist.json'));
  const wishlist = new WishlistService(service, store, steam, { defaultProfile: 'fulano' });
  return { dir, games, service, wishlist, calls, steam };
}

test('lista de desejos: cadastro pela Steam e manual, idempotente e fora da fila', async () => {
  const { dir, service, wishlist, games } = await setup();
  try {
    const total = (await service.recommendations()).total;
    const first = await wishlist.add({ appId: 10, desire: 'Alta' });
    assert.equal(first.created, true);
    assert.equal(first.item.game.status, 'Desejado');
    assert.equal(first.item.game.desire, 'Alta');
    assert.equal(first.item.game.steamAppId, 10);
    assert.equal(first.item.description, 'Descrição dez');
    assert.equal(first.item.price?.finalCents, 2500);
    assert.match(first.item.game.coverUrl ?? '', /\/10\//);
    const again = await wishlist.add({ appId: '10' });
    assert.equal(again.created, false);
    assert.equal(again.item.game.id, first.item.game.id);
    const manual = await wishlist.add({
      name: 'Jogo Sem Steam',
      primaryGenre: 'RPG de ação',
      mainHours: 20,
    });
    assert.equal(manual.created, true);
    assert.equal(manual.item.price, null);
    assert.equal((await wishlist.add({ name: ' jogo sem steam ' })).created, false);
    for (const bad of [
      {},
      { name: '' },
      { name: 'x', rating: 5 },
      { appId: 0 },
      { appId: 10, name: 'x' },
      { name: 'x', desire: 'Imediata!' },
      { name: 'x', primaryGenre: 'Unknown genre' },
    ])
      await assert.rejects(wishlist.add(bad), JSON.stringify(bad));
    await assert.rejects(wishlist.add({ appId: 40 }), /não encontrado/);
    const list: WishlistItem[] = await wishlist.list();
    assert.deepEqual(
      list.map((i) => i.game.name),
      ['Jogo Dez', 'Jogo Sem Steam'],
    );
    // Desejados não entram na fila; mudar o status (comprei!) coloca na fila.
    assert.equal((await service.recommendations()).total, total);
    await service.patch(first.item.game.id, { status: 'Não iniciado' });
    assert.equal((await service.recommendations()).total, total + 1);
    // Persistência: o jogo novo sobrevive a um novo repositório (arquivo JSON).
    const reloaded = new LocalGameRepository(seedGames, join(dir, 'games.json'));
    assert((await reloaded.get(manual.item.game.id))?.name === 'Jogo Sem Steam');
    assert.equal((await games.list()).length, seedGames.length + 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('importação da Steam: cria, ignora repetidos e relata falhas', async () => {
  const { dir, wishlist, calls } = await setup({ wishlist: [10, 20, 40] });
  try {
    const first = await wishlist.importSteam();
    assert.deepEqual(first, {
      total: 3,
      created: 2,
      existing: 0,
      failed: [{ appId: 40, reason: 'Não encontrado na loja (removido ou oculto)' }],
    });
    const second: WishlistImportResult = await wishlist.importSteam({
      profile: '76561198000000001',
    });
    assert.equal(second.created, 0);
    assert.equal(second.existing, 2);
    const items = await wishlist.list();
    assert.equal(items.find((i) => i.game.steamAppId === 20)?.price?.isFree, true);
    assert.equal(items.find((i) => i.game.steamAppId === 20)?.game.coop, 'Online');
    // Preços recém-gravados: listar não chama a Steam de novo.
    const before = calls.length;
    await wishlist.list();
    assert.equal(calls.length, before);
    await wishlist.refreshPrices();
    assert.equal(calls.length, before + 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const empty = await setup({ wishlist: [] });
  try {
    await assert.rejects(empty.wishlist.importSteam(), /vazia ou privada/);
    await assert.rejects(empty.wishlist.importSteam({ profile: 'ninguem' }), /não encontrado/);
  } finally {
    await rm(empty.dir, { recursive: true, force: true });
  }
});

test('preço vencido é buscado de novo ao listar; Steam fora do ar mantém o antigo', async () => {
  const { dir, games, service, steam } = await setup();
  try {
    const store = new LocalWishlistStore(games);
    const wishlist = new WishlistService(service, store, steam, { priceTtlMs: 0 });
    await wishlist.add({ appId: 10 });
    const old = (await wishlist.list())[0].price!;
    const failing = new SteamClient({ fetch: mockFetch({ failTimes: 99 }).fn, sleep: instant });
    const offline = new WishlistService(service, store, failing, { priceTtlMs: 0 });
    assert.equal((await offline.list())[0].price?.finalCents, old.finalCents);
    await assert.rejects(offline.refreshPrices(), (e: { code: number }) => e.code === 502);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('API HTTP: busca, detalhes, cadastro, lista e importação', async () => {
  const { dir, service, wishlist } = await setup();
  const server = makeServer(service, null, wishlist).listen(0);
  try {
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const call = (path: string, method = 'GET', body?: unknown) =>
      fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const search = (await (await call('/steam/search?q=jogo')).json()) as SteamSearchItem[];
    assert.equal(search[0].appId, 10);
    assert.equal((await call('/steam/search')).status, 400);
    assert.equal(((await (await call('/steam/apps/10')).json()) as SteamApp).name, 'Jogo Dez');
    assert.equal((await call('/steam/apps/40')).status, 404);
    assert.equal((await call('/steam/apps/abc')).status, 400);
    const created = await call('/wishlist', 'POST', { appId: 10 });
    assert.equal(created.status, 201);
    assert.equal((await call('/wishlist', 'POST', { appId: 10 })).status, 200);
    assert.equal((await call('/wishlist', 'POST', { name: '' })).status, 400);
    const list = (await (await call('/wishlist')).json()) as WishlistItem[];
    assert.equal(list.length, 1);
    const imported = await call('/wishlist/import-steam', 'POST');
    assert.equal(imported.status, 200);
    assert.equal(((await imported.json()) as WishlistImportResult).created, 1);
    assert.equal((await call('/wishlist/prices/refresh', 'POST')).status, 200);
    const queue = (await (await call('/recommendations')).json()) as Recommendations;
    assert(!queue.items.some((i) => i.game.status === 'Desejado'));
    const games = (await (await call('/games?status=Desejado')).json()) as { total: number };
    assert.equal(games.total, 2);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
