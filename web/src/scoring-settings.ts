import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ScoringConfig, ScoringSettings } from '../../shared/models';
import { listUrl } from './api';
import { DataCache, keys } from './data-cache';

const url = (listId: string) => listUrl(listId) + '/settings/scoring';

const valid = (s: ScoringSettings | undefined) =>
  !!s &&
  Number.isInteger(s.version) &&
  typeof s.config?.weights === 'object' &&
  typeof s.config?.rules === 'object' &&
  typeof s.config?.filters === 'object' &&
  typeof s.filterOptions === 'object' &&
  Array.isArray(s.factors);

/**
 * Configuração do algoritmo de cada lista. Fica no cache do navegador (DataCache) sem prazo:
 * só vai à API quando não há cache, quando foi invalidado (salvar/restaurar) ou quando a
 * fila informa outra `configVersion` (ex.: salvo em outro dispositivo).
 */
@Injectable({ providedIn: 'root' })
export class ScoringSettingsStore {
  private http = inject(HttpClient);
  private cache = inject(DataCache);
  async get(listId: string): Promise<ScoringSettings> {
    const hit = this.cache.peek<ScoringSettings>(keys.settings(listId));
    if (hit && !hit.stale && valid(hit.value)) return hit.value;
    return this.fetch(listId);
  }
  async save(listId: string, config: ScoringConfig): Promise<ScoringSettings> {
    await firstValueFrom(this.http.put<ScoringSettings>(url(listId), config));
    return this.changed(listId);
  }
  async reset(listId: string): Promise<ScoringSettings> {
    await firstValueFrom(this.http.post<ScoringSettings>(url(listId) + '/reset', {}));
    return this.changed(listId);
  }
  /** Chamado com a versão usada pela fila da lista: cache de outra versão é descartado. */
  syncVersion(listId: string, version: number) {
    const hit = this.cache.peek<ScoringSettings>(keys.settings(listId));
    if (hit && hit.value.version !== version) this.cache.drop(keys.settings(listId));
  }
  /** Regras novas: a fila da lista precisa ser recalculada. */
  private async changed(listId: string) {
    this.cache.invalidate(keys.queue(listId));
    return this.fetch(listId);
  }
  private async fetch(listId: string): Promise<ScoringSettings> {
    const fresh = await firstValueFrom(this.http.get<ScoringSettings>(url(listId)));
    this.cache.set(keys.settings(listId), fresh);
    return fresh;
  }
}
