import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useAuth } from './AuthProvider';
import { safeRedirect } from './safeRedirect';

/** Protects the app screens: no session -> /login?redirect=<original route>. */
export function RequireAuth() {
  const { enabled, session } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (!enabled || session) return <Outlet />;
  return (
    <Navigate replace to={'/login?redirect=' + encodeURIComponent(pathname + search + hash)} />
  );
}

/** /login is for signed-out users only (or when auth is disabled in development). */
export function GuestOnly() {
  const { enabled, session } = useAuth();
  const [params] = useSearchParams();
  return enabled && !session ? (
    <Outlet />
  ) : (
    <Navigate replace to={safeRedirect(params.get('redirect'))} />
  );
}
