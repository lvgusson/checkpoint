import { EmptyState, ErrorState } from '@checkpoint/ui-react';
import { AppLoader } from '../loader/AppLoader';
import type { useRouteListId } from './lists-store';

/**
 * What a list route shows before it has a list id: a loader, an error with retry, or the empty
 * state. Renders nothing when `ready`. Test ids: `loader-<prefix>-lists`, `<prefix>-lists`,
 * `<prefix>-lists-retry`, `<prefix>-lists-empty`, `<prefix>-lists-reload`.
 */
export function RouteListState({
  route,
  prefix,
}: {
  route: ReturnType<typeof useRouteListId>;
  prefix: string;
}) {
  if (route.status === 'ready') return null;
  if (route.status === 'error')
    return (
      <ErrorState
        data-testid={`${prefix}-lists`}
        message="Não foi possível carregar suas listas. Confira se a API está no ar."
        retryLabel="Tentar novamente"
        onRetry={route.retry}
      />
    );
  if (route.status === 'empty')
    return (
      <EmptyState
        data-testid={`${prefix}-lists-empty`}
        title="Nenhuma lista encontrada"
        description="Recarregue para criar a lista Principal."
        action={
          <button
            data-testid={`${prefix}-lists-reload`}
            type="button"
            className="button"
            onClick={route.retry}
          >
            Recarregar
          </button>
        }
      />
    );
  return (
    <AppLoader
      fill="block"
      label="Carregando suas listas…"
      data-testid={`loader-${prefix}-lists`}
    />
  );
}
