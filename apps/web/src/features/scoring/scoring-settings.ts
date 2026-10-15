import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ScoringConfig, ScoringSettings } from '../../../../../packages/core/src/models';
import { api, listPath } from '../../api/http';
import { useQueryKeys } from '../../query/keys';

const path = (listId: string) => listPath(listId) + '/settings/scoring';

const valid = (s: ScoringSettings | undefined) =>
  !!s &&
  Number.isInteger(s.version) &&
  typeof s.config?.weights === 'object' &&
  typeof s.config?.rules === 'object' &&
  typeof s.config?.filters === 'object' &&
  typeof s.filterOptions === 'object' &&
  Array.isArray(s.factors);

async function fetchSettings(listId: string, signal?: AbortSignal) {
  const settings = await api.get<ScoringSettings>(path(listId), { signal });
  if (!valid(settings)) throw new Error('Invalid scoring settings response');
  return settings;
}

/**
 * Scoring configuration of a list. Never goes stale on its own (like the Angular store): it is
 * refetched only after save/reset, or when the queue reports another `configVersion`
 * (see `useSyncScoringVersion`).
 */
export function useScoringSettings(listId: string | null | undefined) {
  const k = useQueryKeys();
  return useQuery({
    queryKey: k.settings(listId ?? ''),
    queryFn: ({ signal }) => fetchSettings(listId!, signal),
    enabled: !!listId,
    staleTime: Infinity,
  });
}

function useChange(mutate: (listId: string, config?: ScoringConfig) => Promise<unknown>) {
  const qc = useQueryClient();
  const k = useQueryKeys();
  return useMutation({
    mutationFn: async ({ listId, config }: { listId: string; config?: ScoringConfig }) => {
      await mutate(listId, config);
      // New rules: the list's queue must be recalculated.
      void qc.invalidateQueries({ queryKey: k.queue(listId) });
      const fresh = await fetchSettings(listId);
      qc.setQueryData(k.settings(listId), fresh);
      return fresh;
    },
  });
}

/** PUT the config, then re-read the settings. `mutate({ listId, config })`. */
export const useSaveScoringSettings = () =>
  useChange((listId, config) => api.put<ScoringSettings>(path(listId), { json: config }));

/** Restore the defaults, then re-read the settings. `mutate({ listId })`. */
export const useResetScoringSettings = () =>
  useChange((listId) => api.post<ScoringSettings>(path(listId) + '/reset', { json: {} }));

/** Returns `(listId, version) => void`: invalidates the cached settings when the queue used another version. */
export function useSyncScoringVersion() {
  const qc = useQueryClient();
  const k = useQueryKeys();
  return useCallback(
    (listId: string, version: number) => {
      const cached = qc.getQueryData<ScoringSettings>(k.settings(listId));
      if (cached && cached.version !== version)
        void qc.invalidateQueries({ queryKey: k.settings(listId) });
    },
    // `k` is rebuilt every render but only depends on the user id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, k.all[0]],
  );
}
