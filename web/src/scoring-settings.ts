import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ScoringConfig, ScoringSettings } from '../../shared/models';
import { AuthService } from './auth/auth.service';
import { listUrl } from './api';
import {
  readScoringCache,
  removeScoringCache,
  scoringCacheKey,
  writeScoringCache,
} from './scoring-cache';

const url = (listId: string) => listUrl(listId) + '/settings/scoring';

/**
 * Configuração do algoritmo de cada lista, com cache no navegador: lê do localStorage e só
 * vai à API quando não há cache. Ao salvar/restaurar, invalida o cache, busca o registro
 * novo e regrava. A fila informa `configVersion`; se divergir do cache (ex.: salvo em outro
 * dispositivo), o cache é descartado.
 */
@Injectable({ providedIn: 'root' })
export class ScoringSettingsStore {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private key(listId: string) {
    return scoringCacheKey(this.auth.user()?.id, listId);
  }
  async get(listId: string): Promise<ScoringSettings> {
    return readScoringCache(this.key(listId)) ?? this.fetch(listId);
  }
  async save(listId: string, config: ScoringConfig): Promise<ScoringSettings> {
    await firstValueFrom(this.http.put<ScoringSettings>(url(listId), config));
    removeScoringCache(this.key(listId));
    return this.fetch(listId);
  }
  async reset(listId: string): Promise<ScoringSettings> {
    await firstValueFrom(this.http.post<ScoringSettings>(url(listId) + '/reset', {}));
    removeScoringCache(this.key(listId));
    return this.fetch(listId);
  }
  /** Chamado com a versão usada pela fila da lista: cache de outra versão é descartado. */
  syncVersion(listId: string, version: number) {
    const cached = readScoringCache(this.key(listId));
    if (cached && cached.version !== version) removeScoringCache(this.key(listId));
  }
  private async fetch(listId: string): Promise<ScoringSettings> {
    const fresh = await firstValueFrom(this.http.get<ScoringSettings>(url(listId)));
    writeScoringCache(this.key(listId), fresh);
    return fresh;
  }
}
