import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Catalog,
  GamePage,
  ScoredGame,
  Recommendations,
  ReorderAccepted,
  ManualResetResult,
} from '../../shared/models';
/** Prefixo das rotas de uma lista (fila, ajustes manuais e configuração são por lista). */
export const listUrl = (listId: string) => '/api/v1/lists/' + encodeURIComponent(listId);
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);
  catalog() {
    return firstValueFrom(this.http.get<Catalog>('/api/v1/catalog'));
  }
  list(params: Record<string, string | number>) {
    return firstValueFrom(this.http.get<GamePage>('/api/v1/games', { params }));
  }
  game(id: string) {
    return firstValueFrom(this.http.get<ScoredGame>('/api/v1/games/' + encodeURIComponent(id)));
  }
  queue(listId: string) {
    return firstValueFrom(this.http.get<Recommendations>(listUrl(listId) + '/recommendations'));
  }
  /** Responde assim que valida; o servidor recalcula e grava depois. */
  reorder(listId: string, gameId: string, toPosition: number) {
    return firstValueFrom(
      this.http.post<ReorderAccepted>(listUrl(listId) + '/queue/reorder', {
        gameId,
        toPosition,
      }),
    );
  }
  resetManual(listId: string, gameId: string) {
    return firstValueFrom(
      this.http.delete<ManualResetResult>(
        listUrl(listId) + '/queue/adjustments/' + encodeURIComponent(gameId),
      ),
    );
  }
  save(id: string, patch: Record<string, unknown>) {
    return firstValueFrom(
      this.http.patch<ScoredGame>('/api/v1/games/' + encodeURIComponent(id), patch),
    );
  }
}
export const color = (v: string) => {
  if (v === 'Imediata') return 'rose';
  if (v === 'Finalizado' || v === 'Muito Alta') return 'green';
  if (v === 'Jogando' || v === 'Alta') return 'blue';
  if (v === 'Abandonado' || v === 'Muito Baixa') return 'gray';
  if (v === 'Média') return 'amber';
  const n = [...v].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ['violet', 'blue', 'amber', 'rose', 'green'][n % 5];
};
