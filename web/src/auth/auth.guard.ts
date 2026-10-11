import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/** Protege as telas do app: sem sessão → /login?redirect=<rota original>. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.enabled() || auth.session()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

/** /login só para quem não está logado (ou quando a auth está desligada no dev). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.enabled() && !auth.session()) return true;
  return inject(Router).createUrlTree(['/jogos']);
};

/** Evita open redirect: só aceita caminhos internos ("/x", nunca "//host" ou URL absoluta). */
export const safeRedirect = (value: string | null | undefined, fallback = '/jogos') =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : fallback;
