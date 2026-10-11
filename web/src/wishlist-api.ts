import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  SteamPrice,
  SteamSearchItem,
  WishlistImportResult,
  WishlistItem,
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class WishlistApi {
  private http = inject(HttpClient);
  list() {
    return firstValueFrom(this.http.get<WishlistItem[]>('/api/v1/wishlist'));
  }
  search(q: string) {
    return firstValueFrom(
      this.http.get<SteamSearchItem[]>('/api/v1/steam/search', { params: { q } }),
    );
  }
  add(body: Record<string, unknown>) {
    return firstValueFrom(
      this.http.post<WishlistItem & { created: boolean }>('/api/v1/wishlist', body),
    );
  }
  importSteam(profile: string) {
    return firstValueFrom(
      this.http.post<WishlistImportResult>(
        '/api/v1/wishlist/import-steam',
        profile.trim() ? { profile: profile.trim() } : {},
      ),
    );
  }
  refreshPrices() {
    return firstValueFrom(this.http.post<WishlistItem[]>('/api/v1/wishlist/prices/refresh', {}));
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
