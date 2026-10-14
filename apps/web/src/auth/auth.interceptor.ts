import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  type HttpHandlerFn,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Adiciona `Authorization: Bearer <access_token>` às chamadas da própria API (/api/...).
 * Em 401: um único refreshSession() compartilhado entre requisições simultâneas, e repete
 * a requisição uma vez. Se o refresh falhar (ou o retry der 401 de novo), faz logout —
 * o evento SIGNED_OUT leva para /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  // URLs relativas da API apenas: o token nunca vai para outros domínios.
  if (!auth.enabled() || !req.url.startsWith('/api/') || req.url === '/api/v1/config')
    return next(req);

  return from(auth.accessToken()).pipe(
    switchMap((token) => next(withToken(req, token))),
    catchError((error: unknown) => {
      if (!is401(error)) return throwError(() => error);
      return from(auth.refreshToken()).pipe(
        switchMap((token) => (token ? retry(auth, req, next, token) : logout(auth, error))),
      );
    }),
  );
};

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : req;

const is401 = (error: unknown) => error instanceof HttpErrorResponse && error.status === 401;

function retry(auth: AuthService, req: HttpRequest<unknown>, next: HttpHandlerFn, token: string) {
  return next(withToken(req, token)).pipe(
    catchError((error: unknown) => (is401(error) ? logout(auth, error) : throwError(() => error))),
  );
}

function logout(auth: AuthService, error: unknown) {
  void auth.signOut('local');
  return throwError(() => error);
}
