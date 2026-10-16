import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, useRouteError } from 'react-router';
import { GuestOnly, RequireAuth } from '../auth/guards';
import { AppLoader } from '../features/loader/AppLoader';
import { Shell } from './Shell';

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading (CSS )?chunk .* failed/i;
const CHUNK_RELOAD_KEY = 'checkpoint:chunk-reload';
const CHUNK_RELOAD_WINDOW_MS = 10_000;

export function RouteErrorBoundary() {
  const error = useRouteError();
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : typeof error === 'object' &&
              error !== null &&
              'statusText' in error &&
              typeof (error as { statusText: unknown }).statusText === 'string'
            ? (error as { statusText: string }).statusText
            : String(error ?? '');

  const isChunkError = CHUNK_ERROR_RE.test(errorMessage);

  useEffect(() => {
    if (!isChunkError) {
      return;
    }
    try {
      const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      const lastReload = raw ? Number(raw) : 0;
      const now = Date.now();
      if (!lastReload || Number.isNaN(lastReload) || now - lastReload > CHUNK_RELOAD_WINDOW_MS) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
        window.location.reload();
      }
    } catch {
      // Avoid loops when sessionStorage is restricted.
    }
  }, [isChunkError]);

  return (
    <div
      data-testid="route-error-boundary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
        gap: '1rem',
      }}
    >
      <h2>Não foi possível carregar a página</h2>
      <p style={{ maxWidth: '32rem', color: 'var(--muted)' }}>
        {errorMessage || 'Ocorreu um erro inesperado ao carregar a página.'}
      </p>
      <button
        data-testid="route-error-reload"
        type="button"
        className="button"
        onClick={() => window.location.reload()}
      >
        Recarregar página
      </button>
    </div>
  );
}

const LoginPage = lazy(() => import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const LibraryPage = lazy(() =>
  import('../pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const DetailPage = lazy(() =>
  import('../pages/DetailPage').then((m) => ({ default: m.DetailPage })),
);
const QueuePage = lazy(() => import('../pages/QueuePage').then((m) => ({ default: m.QueuePage })));
const WishlistPage = lazy(() =>
  import('../pages/WishlistPage').then((m) => ({ default: m.WishlistPage })),
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const AppearancePage = lazy(() =>
  import('../pages/AppearancePage').then((m) => ({ default: m.AppearancePage })),
);
const ComponentCatalogPage = lazy(() =>
  import('../pages/ComponentCatalogPage').then((m) => ({ default: m.ComponentCatalogPage })),
);
const ComponentDetailPage = lazy(() =>
  import('../pages/ComponentDetailPage').then((m) => ({ default: m.ComponentDetailPage })),
);

/** Same URL space as the Angular app. Without :listId, queue/settings resolve the default list themselves. */
export const router = createBrowserRouter([
  {
    element: <Shell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: (
          <Suspense fallback={<AppLoader fill="screen" data-testid="loader-route" />}>
            <Outlet />
          </Suspense>
        ),
        children: [
          { element: <GuestOnly />, children: [{ path: 'login', element: <LoginPage /> }] },
          { path: 'redefinir-senha', element: <LoginPage initialMode="reset" /> },
          { path: 'componentes', element: <ComponentCatalogPage /> },
          { path: 'componentes/:name', element: <ComponentDetailPage /> },
          {
            element: <RequireAuth />,
            children: [
              { path: 'jogos', element: <LibraryPage /> },
              { path: 'jogos/:id', element: <DetailPage /> },
              { path: 'ordem', element: <QueuePage /> },
              { path: 'ordem/:listId', element: <QueuePage /> },
              { path: 'desejos', element: <WishlistPage /> },
              { path: 'configuracoes', element: <SettingsPage /> },
              { path: 'configuracoes/:listId', element: <SettingsPage /> },
              { path: 'aparencia', element: <AppearancePage /> },
            ],
          },
        ],
      },
      { index: true, element: <Navigate replace to="/ordem" /> },
      { path: '*', element: <Navigate replace to="/ordem" /> },
    ],
  },
]);
