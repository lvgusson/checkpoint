import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Catalog,
  GamePage,
  ScoredGame,
  Recommendations,
  ReorderResult,
  ManualResetResult,
} from '../../shared/models';
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
  queue() {
    return firstValueFrom(this.http.get<Recommendations>('/api/v1/recommendations'));
  }
  reorder(gameId: string, toPosition: number) {
    return firstValueFrom(
      this.http.post<ReorderResult>('/api/v1/queue/reorder', {
        gameId,
        toPosition,
      }),
    );
  }
  resetManual(gameId: string) {
    return firstValueFrom(
      this.http.delete<ManualResetResult>(
        '/api/v1/queue/adjustments/' + encodeURIComponent(gameId),
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
  if (v === 'Finalizado' || v === 'Muito Alta') return 'green';
  if (v === 'Jogando' || v === 'Alta') return 'blue';
  if (v === 'Abandonado' || v === 'Muito Baixa') return 'gray';
  if (v === 'Desejado') return 'rose';
  if (v === 'Média') return 'amber';
  const n = [...v].reduce((a, c) => a + c.charCodeAt(0), 0);
  return ['violet', 'blue', 'amber', 'rose', 'green'][n % 5];
};
