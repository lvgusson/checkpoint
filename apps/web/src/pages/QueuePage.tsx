import { QueueView } from '../features/queue/QueueView';
import { RouteListState, useRouteListId } from '../features/lists';

/** Route /ordem and /ordem/:listId. Without a valid list id the hook redirects to the default list. */
export function QueuePage() {
  const route = useRouteListId('/ordem');
  const { listId } = route;
  return (
    <>
      <div className="page-heading queue-heading">
        <div>
          <span className="eyebrow">MENOS DECISÃO, MAIS DIVERSÃO</span>
          <h1>
            Ordem de jogos<span className="heading-dot">.</span>
          </h1>
          <p>Uma fila que aprende com você e alterna estilos, ritmos e duração.</p>
        </div>
      </div>
      {listId ? (
        <QueueView key={listId} listId={listId} />
      ) : (
        <RouteListState route={route} prefix="queue" />
      )}
    </>
  );
}
