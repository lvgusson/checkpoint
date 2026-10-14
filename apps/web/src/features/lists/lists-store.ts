import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { GameList } from '../../../../../packages/core/src/models';
import { api } from '../../api/http';
import { useAuth } from '../../auth/AuthProvider';
import { useQueryKeys } from '../../query/keys';

/** User lists (every list sees every game; rules and manual order are per list). The API creates "Principal" when there is none. */
export function useLists() {
  const k = useQueryKeys();
  return useQuery({
    queryKey: k.lists(),
    queryFn: ({ signal }) => api.get<GameList[]>('lists', { signal }),
  });
}

/** create/rename/remove keep the cached list collection in sync; remove also drops that list's queue and settings. */
export function useListMutations() {
  const qc = useQueryClient();
  const k = useQueryKeys();
  const update = (change: (lists: GameList[]) => GameList[]) =>
    qc.setQueryData<GameList[]>(k.lists(), (lists) => change(lists ?? []));
  const id = (listId: string) => 'lists/' + encodeURIComponent(listId);
  return {
    create: useMutation({
      mutationFn: (name: string) => api.post<GameList>('lists', { json: { name } }),
      onSuccess: (list) => update((lists) => [...lists, list]),
    }),
    rename: useMutation({
      mutationFn: ({ id: listId, name }: { id: string; name: string }) =>
        api.patch<GameList>(id(listId), { json: { name } }),
      onSuccess: (list) => update((lists) => lists.map((l) => (l.id === list.id ? list : l))),
    }),
    remove: useMutation({
      mutationFn: (listId: string) => api.delete<void>(id(listId)),
      onSuccess: (_, listId) => {
        update((lists) => lists.filter((l) => l.id !== listId));
        qc.removeQueries({ queryKey: k.settings(listId) });
        qc.removeQueries({ queryKey: k.queue(listId) });
      },
    }),
  };
}

/** Last list opened, per user (for when the URL carries none, e.g. queue to settings). */
const lastOpened = new Map<string, string>();

/**
 * `listId` of the route (`/ordem/:listId`, `/configuracoes/:listId`). Without an id in the URL, or
 * with an unknown one, it redirects to the last used list, else the first.
 */
export function useRouteListId(base: string) {
  const current = useParams().listId ?? null;
  const { userId } = useAuth();
  const navigate = useNavigate();
  const { data: lists } = useLists();
  useEffect(() => {
    if (!lists?.length) return;
    if (lists.some((l) => l.id === current)) {
      lastOpened.set(userId, current!);
      return;
    }
    const target = lists.find((l) => l.id === lastOpened.get(userId)) ?? lists[0]!;
    void navigate(`${base}/${target.id}`, { replace: true });
  }, [lists, current, base, userId, navigate]);
  // Unknown ids are not exposed, so callers never request a queue for a list that does not exist.
  return lists?.some((l) => l.id === current) ? current : null;
}
