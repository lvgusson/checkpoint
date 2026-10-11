// Cache da configuração do algoritmo no localStorage (uma chave por usuário e lista).
// Todo acesso fica em try/catch: sem localStorage (modo privado, bloqueado), só busca na API.
import type { ScoringSettings } from '../../shared/models';

const PREFIX = 'checkpoint:scoring-settings:';

export const scoringCacheKey = (userId: string | null | undefined, listId: string) =>
  PREFIX + (userId ?? 'local') + ':' + listId;

export function readScoringCache(key: string): ScoringSettings | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as ScoringSettings;
    const valid =
      Number.isInteger(s?.version) &&
      typeof s.config?.weights === 'object' &&
      typeof s.config?.rules === 'object' &&
      typeof s.config?.filters === 'object' &&
      typeof s.filterOptions === 'object' &&
      Array.isArray(s.factors);
    return valid ? s : null;
  } catch {
    return null;
  }
}

export function writeScoringCache(key: string, settings: ScoringSettings): void {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Sem cache: a próxima leitura busca na API.
  }
}

export function removeScoringCache(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Logout: apaga o cache de todos os usuários deste navegador. */
export function clearScoringCache(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
