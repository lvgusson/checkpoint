import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useAuth } from '../auth/AuthProvider';
import { authSession } from '../auth/session';
import { useUnhandledErrors } from '../query/errors';
import { Toaster } from '@/components/ui/sonner';
import { Logo } from './Logo';

/** Navigation targets (sidebar on desktop, tab bar on mobile). */
const NAV = [
  { path: '/jogos', icon: '▦', label: 'Lista de jogos', short: 'Jogos' },
  { path: '/desejos', icon: '♡', label: 'Lista de desejos', short: 'Desejos' },
  { path: '/ordem', icon: '≋', label: 'Ordem de jogos', short: 'Ordem' },
  { path: '/configuracoes', icon: '⚙', label: 'Regras da fila', short: 'Regras' },
  { path: '/aparencia', icon: '◐', label: 'Aparência e conta', short: 'Aparência' },
];

/** Login and reset screens use the whole page (no menu or top bar). */
const BARE = /^\/(login|redefinir-senha)(\/|$)/;

/** Auth-driven navigation, as the Angular auth service did on onAuthStateChange. */
function useAuthNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(
    () =>
      authSession.onEvent((event) => {
        if (event === 'PASSWORD_RECOVERY') void navigate('/redefinir-senha');
        if (event === 'SIGNED_OUT' && !location.pathname.startsWith('/login'))
          void navigate(
            '/login?redirect=' + encodeURIComponent(location.pathname + location.search),
            { replace: true },
          );
      }),
    [navigate, location.pathname, location.search],
  );
}

export function Shell() {
  const { user, signOut } = useAuth();
  const { resolved, update } = useAppearance();
  const bare = BARE.test(useLocation().pathname);
  useAuthNavigation();
  useUnhandledErrors(useCallback((message: string) => void toast.error(message), []));

  const links = (key: 'label' | 'short', icons: boolean) =>
    NAV.map((n) => (
      <NavLink
        key={n.path}
        to={n.path}
        className={({ isActive }) => (isActive ? 'active' : undefined)}
      >
        {icons && <span aria-hidden="true">{n.icon} </span>}
        {!icons && <span aria-hidden="true">{n.icon}</span>}
        {n[key]}
      </NavLink>
    ));

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className={bare ? 'shell bare' : 'shell'}>
        {!bare && (
          <aside className="sidebar">
            <Link className="brand" to="/ordem">
              <Logo />
              <span>
                checkpoint<small>SUA BIBLIOTECA, SEU RITMO</small>
              </span>
            </Link>
            <nav aria-label="Principal">{links('label', true)}</nav>
            {user && (
              <div className="sidebar-note">
                <span className="account-email" title={user.email ?? ''}>
                  {user.email}
                </span>
                <button type="button" className="button" onClick={() => void signOut()}>
                  Sair
                </button>
              </div>
            )}
          </aside>
        )}
        <div className="main" style={bare ? { marginLeft: 0, width: '100%' } : undefined}>
          {!bare && (
            <header className="topbar">
              <Link className="brand compact" to="/ordem" aria-label="Checkpoint, início">
                <Logo />
                <span>checkpoint</span>
              </Link>
              <span className="topbar-title">MEU ESPAÇO DE JOGOS</span>
              <button
                type="button"
                className="icon-button theme-toggle"
                onClick={() => update({ theme: resolved === 'dark' ? 'light' : 'dark' })}
                aria-label={resolved === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              >
                <span aria-hidden="true">{resolved === 'dark' ? '☀' : '☾'}</span>
              </button>
            </header>
          )}
          <main
            id="conteudo"
            tabIndex={-1}
            style={bare ? { padding: 0, maxWidth: 'none' } : undefined}
          >
            <Outlet />
          </main>
          {!bare && (
            <>
              <footer>
                Checkpoint <span>Feito para jogar no seu ritmo.</span>
              </footer>
              <nav className="tabbar" aria-label="Principal">
                {links('short', false)}
              </nav>
            </>
          )}
        </div>
      </div>
      <Toaster />
    </>
  );
}
