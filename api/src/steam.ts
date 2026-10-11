// Cliente da Steam (somente leitura). Endpoints usados:
//   - store.steampowered.com/api/storesearch      busca por NOME (sem chave), já traz o preço;
//   - IStoreBrowseService/GetItems               detalhes em LOTE por appid (sem chave): nome,
//                                                 descrição pt-BR, tags, imagens, lançamento, preço;
//   - IStoreService/GetTagList                    nomes das tags em pt-BR (cache em memória);
//   - IWishlistService/GetWishlist               lista de desejos de um SteamID64 (perfil público);
//   - ISteamUser/ResolveVanityURL                 URL personalizada -> SteamID64 (exige chave).
// A chave vai na query string: URLs NUNCA são logadas nem colocadas em mensagens de erro.
import type { SteamApp, SteamPrice, SteamSearchItem } from '../../shared/models.ts';
import { retry } from './retry.ts';

type Fetch = typeof fetch;

export class SteamError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export interface SteamClientOptions {
  apiKey?: string;
  /** Loja/moeda dos preços (ISO 3166). */
  countryCode?: string;
  fetch?: Fetch;
  timeoutMs?: number;
  /** Repassado ao retry (testes usam sleep instantâneo). */
  sleep?: (ms: number) => Promise<void>;
}

const STORE = 'https://store.steampowered.com';
const API = 'https://api.steampowered.com';
const CDN = 'https://shared.akamai.steamstatic.com/store_item_assets/';
/** GetItems aceita muitos ids por chamada; 50 mantém a URL curta. */
const BATCH = 50;
const TAGS_TTL_MS = 24 * 3600_000;

interface RawPurchaseOption {
  final_price_in_cents?: string;
  original_price_in_cents?: string;
  discount_pct?: number;
  formatted_final_price?: string;
  active_discounts?: { discount_end_date?: number }[];
}
interface RawStoreItem {
  appid?: number;
  id: number;
  success: number;
  visible?: boolean;
  name?: string;
  is_free?: boolean;
  store_url_path?: string;
  tagids?: number[];
  basic_info?: {
    short_description?: string;
    developers?: { name: string }[];
    publishers?: { name: string }[];
  };
  assets?: Record<string, string | number | undefined> & { asset_url_format?: string };
  release?: { steam_release_date?: number; coming_soon_display?: string };
  best_purchase_option?: RawPurchaseOption;
}

const now = () => new Date().toISOString();

/** price_overview (loja) ou best_purchase_option (GetItems) -> SteamPrice. */
export function priceFromPurchase(
  option: RawPurchaseOption | undefined,
  isFree: boolean,
  currency: string,
): SteamPrice | null {
  if (isFree)
    return {
      currency,
      initialCents: 0,
      finalCents: 0,
      discountPercent: 0,
      discountEndsAt: null,
      isFree: true,
      formatted: 'Gratuito',
      fetchedAt: now(),
    };
  if (!option?.final_price_in_cents) return null;
  const final = Number(option.final_price_in_cents);
  const initial = Number(option.original_price_in_cents ?? option.final_price_in_cents);
  const end = option.active_discounts?.[0]?.discount_end_date;
  return {
    currency,
    initialCents: initial,
    finalCents: final,
    discountPercent:
      option.discount_pct ?? (initial > final ? Math.round((1 - final / initial) * 100) : 0),
    discountEndsAt: end ? new Date(end * 1000).toISOString() : null,
    isFree: false,
    formatted: option.formatted_final_price ?? null,
    fetchedAt: now(),
  };
}

/** Aceita SteamID64, URL de perfil (/profiles/<id> ou /id/<nome>) ou o nome personalizado. */
export function parseSteamProfile(
  profile: string,
): { steamId: string } | { vanity: string } | null {
  const p = profile.trim();
  if (!p) return null;
  if (/^7656\d{13}$/.test(p)) return { steamId: p };
  const url = p.match(/steamcommunity\.com\/(id|profiles)\/([^/?#\s]+)/i);
  if (url) return url[1].toLowerCase() === 'profiles' ? { steamId: url[2] } : { vanity: url[2] };
  if (/^[A-Za-z0-9_-]{2,64}$/.test(p)) return { vanity: p };
  return null;
}

/** Erros transitórios (rede, timeout, 429, 5xx) merecem nova tentativa; 4xx não. */
const transient = (e: unknown) => !(e instanceof SteamError) || e.status >= 500 || e.status === 429;

export class SteamClient {
  private apiKey: string | undefined;
  private countryCode: string;
  private currency: string;
  private fetchImpl: Fetch;
  private timeoutMs: number;
  private sleep?: (ms: number) => Promise<void>;
  private tags: { at: number; names: Map<number, string> } | null = null;

  constructor({
    apiKey,
    countryCode = 'BR',
    fetch: fetchImpl = fetch,
    timeoutMs = 8000,
    sleep,
  }: SteamClientOptions = {}) {
    this.apiKey = apiKey || undefined;
    this.countryCode = countryCode.toUpperCase();
    this.currency = this.countryCode === 'BR' ? 'BRL' : 'USD';
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.sleep = sleep;
  }

  get hasApiKey() {
    return !!this.apiKey;
  }

  /** GET JSON com timeout e retry; `label` é o que aparece em erros (nunca a URL). */
  private getJson<T>(label: string, url: string): Promise<T> {
    return retry(
      async () => {
        let res: Response;
        try {
          res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs) });
        } catch {
          throw new SteamError(`Steam indisponível (${label})`, 503);
        }
        if (!res.ok) throw new SteamError(`Steam respondeu ${res.status} (${label})`, res.status);
        try {
          return (await res.json()) as T;
        } catch {
          throw new SteamError(`Resposta inválida da Steam (${label})`);
        }
      },
      { attempts: 3, shouldRetry: transient, sleep: this.sleep },
    );
  }

  /** Busca por nome na loja (até 10 resultados; só apps). */
  async search(term: string): Promise<SteamSearchItem[]> {
    const q = term.trim();
    if (!q) return [];
    const data = await this.getJson<{
      items?: {
        type: string;
        id: number;
        name: string;
        tiny_image?: string;
        price?: { currency: string; initial: number; final: number };
      }[];
    }>(
      'busca',
      `${STORE}/api/storesearch/?term=${encodeURIComponent(q)}&l=portuguese&cc=${this.countryCode}`,
    );
    return (data.items ?? [])
      .filter((i) => i.type === 'app')
      .map((i) => ({
        appId: i.id,
        name: i.name,
        imageUrl: i.tiny_image ?? null,
        price: i.price
          ? {
              currency: i.price.currency,
              initialCents: i.price.initial,
              finalCents: i.price.final,
              discountPercent:
                i.price.initial > i.price.final
                  ? Math.round((1 - i.price.final / i.price.initial) * 100)
                  : 0,
              discountEndsAt: null,
              isFree: false,
              formatted: null,
              fetchedAt: now(),
            }
          : null,
      }));
  }

  /** Nomes das tags em pt-BR (cache de 24 h). */
  private async tagNames(): Promise<Map<number, string>> {
    if (this.tags && Date.now() - this.tags.at < TAGS_TTL_MS) return this.tags.names;
    const data = await this.getJson<{ response?: { tags?: { tagid: number; name: string }[] } }>(
      'tags',
      `${API}/IStoreService/GetTagList/v1/?language=brazilian`,
    );
    const names = new Map((data.response?.tags ?? []).map((t) => [t.tagid, t.name]));
    this.tags = { at: Date.now(), names };
    return names;
  }

  private async rawItems(appIds: number[]): Promise<RawStoreItem[]> {
    const out: RawStoreItem[] = [];
    for (let i = 0; i < appIds.length; i += BATCH) {
      const input = {
        ids: appIds.slice(i, i + BATCH).map((appid) => ({ appid })),
        context: { language: 'brazilian', country_code: this.countryCode },
        data_request: {
          include_basic_info: true,
          include_tag_count: 20,
          include_assets: true,
          include_release: true,
        },
      };
      const data = await this.getJson<{ response?: { store_items?: RawStoreItem[] } }>(
        'detalhes',
        `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      );
      out.push(...(data.response?.store_items ?? []));
    }
    return out;
  }

  /** Detalhes de vários apps (lotes de 50). Apps inexistentes/ocultos ficam de fora. */
  async apps(appIds: number[]): Promise<SteamApp[]> {
    const ids = [...new Set(appIds)];
    if (!ids.length) return [];
    const [items, tags] = await Promise.all([this.rawItems(ids), this.tagNames()]);
    return items
      .filter((i) => i.success === 1 && i.name)
      .map((i) => {
        const appId = i.appid ?? i.id;
        const asset = (name: string) => {
          const file = i.assets?.[name];
          const format = i.assets?.asset_url_format;
          return typeof file === 'string' && format
            ? CDN + format.replace('${FILENAME}', file)
            : null;
        };
        const release = i.release?.steam_release_date;
        return {
          appId,
          name: i.name!,
          shortDescription: i.basic_info?.short_description ?? '',
          tags: (i.tagids ?? []).map((t) => tags.get(t)).filter((t): t is string => !!t),
          developers: (i.basic_info?.developers ?? []).map((d) => d.name),
          publishers: (i.basic_info?.publishers ?? []).map((d) => d.name),
          releaseDate: release ? new Date(release * 1000).toISOString().slice(0, 10) : null,
          headerUrl: asset('header'),
          capsuleUrl: asset('main_capsule') ?? asset('small_capsule'),
          heroUrl: asset('library_hero'),
          storeUrl: `${STORE}/app/${appId}`,
          price: priceFromPurchase(i.best_purchase_option, !!i.is_free, this.currency),
        };
      });
  }

  async app(appId: number): Promise<SteamApp | null> {
    return (await this.apps([appId]))[0] ?? null;
  }

  /** Só preços (mesma chamada em lote; o resto do payload é descartado). */
  async prices(appIds: number[]): Promise<Map<number, SteamPrice | null>> {
    const items = await this.rawItems([...new Set(appIds)]);
    return new Map(
      items
        .filter((i) => i.success === 1)
        .map((i) => [
          i.appid ?? i.id,
          priceFromPurchase(i.best_purchase_option, !!i.is_free, this.currency),
        ]),
    );
  }

  /** SteamID64 a partir de id, URL ou nome personalizado (este último exige a chave). */
  async resolveSteamId(profile: string): Promise<string> {
    const parsed = parseSteamProfile(profile);
    if (!parsed) throw new SteamError('Perfil da Steam inválido', 400);
    if ('steamId' in parsed) return parsed.steamId;
    if (!this.apiKey)
      throw new SteamError('Configure STEAM_API_KEY ou informe o SteamID64 do perfil', 400);
    const data = await this.getJson<{ response?: { success: number; steamid?: string } }>(
      'perfil',
      `${API}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(this.apiKey)}&vanityurl=${encodeURIComponent(parsed.vanity)}`,
    );
    if (data.response?.success !== 1 || !data.response.steamid)
      throw new SteamError(
        'Perfil da Steam não encontrado: use o SteamID64 ou a URL do perfil',
        404,
      );
    return data.response.steamid;
  }

  /**
   * Appids da lista de desejos (ordem de prioridade). Perfil privado responde vazio:
   * a Steam não distingue "privada" de "vazia".
   */
  async wishlist(steamId: string): Promise<number[]> {
    const data = await this.getJson<{
      response?: { items?: { appid: number; priority?: number }[] };
    }>('lista de desejos', `${API}/IWishlistService/GetWishlist/v1/?steamid=${steamId}`);
    return (data.response?.items ?? [])
      .slice()
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
      .map((i) => i.appid);
  }
}

/** Perfil padrão do dono (STEAM_PROFILE; aceita os nomes antigos do .env). */
export const steamProfileFromEnv = (env: Record<string, string | undefined> = process.env) =>
  env.STEAM_PROFILE || env.STEAM_DOMAIN || env.STEAM_DOMIAN || '';

export const steamClientFromEnv = (env: Record<string, string | undefined> = process.env) =>
  new SteamClient({ apiKey: env.STEAM_API_KEY, countryCode: env.STEAM_COUNTRY || 'BR' });
