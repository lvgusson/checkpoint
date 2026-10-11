import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ScoringConfig, ScoringSettings } from '../../shared/models';
import { AuthService } from './auth/auth.service';
import {
  readScoringCache,
  removeScoringCache,
  scoringCacheKey,
  writeScoringCache,
} from './scoring-cache';

const URL = '/api/v1/settings/scoring';

/**
 * Configuração do algoritmo com cache no navegador: lê do localStorage e só vai à API
 * quando não há cache. Ao salvar/restaurar, invalida o cache, busca o registro novo e
 * regrava. A fila informa `configVersion`; se divergir do cache (ex.: salvo em outro
 * dispositivo), o cache é descartado.
 */
@Injectable({ providedIn: 'root' })
export class ScoringSettingsStore {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private key() {
    return scoringCacheKey(this.auth.user()?.id);
  }
  async get(): Promise<ScoringSettings> {
    return readScoringCache(this.key()) ?? this.fetch();
  }
  async save(config: ScoringConfig): Promise<ScoringSettings> {
    await firstValueFrom(this.http.put<ScoringSettings>(URL, config));
    removeScoringCache(this.key());
    return this.fetch();
  }
  async reset(): Promise<ScoringSettings> {
    await firstValueFrom(this.http.post<ScoringSettings>(URL + '/reset', {}));
    removeScoringCache(this.key());
    return this.fetch();
  }
  /** Chamado com a versão usada pela fila: cache de outra versão é descartado. */
  syncVersion(version: number) {
    const cached = readScoringCache(this.key());
    if (cached && cached.version !== version) removeScoringCache(this.key());
  }
  private async fetch(): Promise<ScoringSettings> {
    const fresh = await firstValueFrom(this.http.get<ScoringSettings>(URL));
    writeScoringCache(this.key(), fresh);
    return fresh;
  }
}
