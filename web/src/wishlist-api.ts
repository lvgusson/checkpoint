import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  SteamPrice,
  SteamSearchItem,
  WishlistImportResult,
  WishlistItem,
} from '../../shared/models';
import { DataCache, GAME_DEPENDENTS, keys } from './data-cache';

@Injectable({ providedIn: 'root' })
export class WishlistApi {
  private http = inject(HttpClient);
  private cache = inject(DataCache);
  /** Cache na hora + revalidação (a API atualiza preços com mais de 6 h). */
  list(onValue: (items: WishlistItem[]) => void = () => {}, force = false) {
    return this.cache.swr(
      keys.wishlist,
      () => firstValueFrom(this.http.get<WishlistItem[]>('/api/v1/wishlist')),
      onValue,
      { force },
    );
  }
  /** Cadastros mudam a biblioteca (jogos e catálogo) além da lista de desejos. */
  private changed() {
    this.cache.invalidate(...GAME_DEPENDENTS);
  }
  search(q: string) {
    return firstValueFrom(
      this.http.get<SteamSearchItem[]>('/api/v1/steam/search', { params: { q } }),
    );
  }
  async add(body: Record<string, unknown>) {
    const r = await firstValueFrom(
      this.http.post<WishlistItem & { created: boolean }>('/api/v1/wishlist', body),
    );
    this.changed();
    return r;
  }
  async importSteam(profile: string) {
    const r = await firstValueFrom(
      this.http.post<WishlistImportResult>(
        '/api/v1/wishlist/import-steam',
        profile.trim() ? { profile: profile.trim() } : {},
      ),
    );
    this.changed();
    return r;
  }
  async refreshPrices() {
    const items = await firstValueFrom(
      this.http.post<WishlistItem[]>('/api/v1/wishlist/prices/refresh', {}),
    );
    this.cache.set(keys.wishlist, items);
    return items;
  }
}

/** "R$ 46,99" a partir dos centavos (usa o texto da Steam quando houver). */
export function formatPrice(p: SteamPrice | null): string {
  if (!p) return 'Sem preço';
  if (p.isFree) return 'Gratuito';
  if (p.finalCents === null) return 'Indisponível';
  return (p.finalCents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: p.currency ?? 'BRL',
  });
}
