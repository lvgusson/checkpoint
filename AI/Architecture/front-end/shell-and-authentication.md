---
id: architecture.frontend.shell-auth
title: Shell, authentication and appearance
type: module
area: frontend
status: active
owner: unknown
last_verified: 2026-10-12
source_paths:
  - web/src/bonfire.ts
  - web/src/main.ts
  - web/src/auth/auth.service.ts
  - web/src/auth/auth.guard.ts
  - web/src/auth/auth.interceptor.ts
  - web/src/auth/login.ts
  - web/src/appearance.ts
  - web/src/appearance-page.ts
  - web/src/logo.ts
  - web/src/index.html
related_domains:
  - domain.identity
tags: [angular, frontend]
---

# Shell, authentication and appearance

## 1. Purpose

Own application initialization, route access, account forms, shared navigation and local appearance preferences.

## 2. Scope and ownership

Includes the root shell, session signals, bearer interception, login/recovery UI, theme selection and branding. JWT validation and server authorization belong to security/backend.

## 3. Architecture map

| Responsibility           | Location                                                                 | Detail                  |
| ------------------------ | ------------------------------------------------------------------------ | ----------------------- |
| Bootstrap/navigation     | `web/src/main.ts`                                                        | `App`, router providers |
| Session lifecycle        | `web/src/auth/auth.service.ts`                                           | `AuthService`           |
| Route access/token retry | `web/src/auth/auth.guard.ts`, `web/src/auth/auth.interceptor.ts`         | Guards, interceptor     |
| Account forms            | `web/src/auth/login.ts`                                                  | `Login`                 |
| Visual preferences       | `web/src/appearance.ts`, `web/src/appearance-page.ts`, `web/src/logo.ts` | Store, editor, branding |

## 4. Contracts and behavior

`AuthService.init` fetches `/api/v1/config` directly before initial navigation. Missing auth configuration disables auth; config failure records `initError` while enabled remains true. The Supabase client persists sessions, refreshes tokens, and handles URL sessions. Recovery events navigate to `/redefinir-senha`; signed-out events clear data-cache storage and navigate to login. Guards protect pages when enabled; `safeRedirect` accepts only internal path forms. The interceptor attaches tokens to relative `/api/` calls except config, shares refresh across simultaneous 401s, retries once, then signs out on authentication failure.

`Login` offers login/signup/forgot/reset modes with required identifiers/passwords as applicable, an eight-character password minimum and confirmation matching. Login accepts an email address or a case-insensitive username matching `[a-z0-9._-]{3,32}`. `AuthService.signIn` trims input and maps usernames to their lowercase form plus `@gps.dev.br`; signup and password-recovery forms require an email address. GitHub visibility follows public config. Appearance supports system/light/dark, five accents, five built-in logos (bonfire is the default) or uploaded PNG/JPEG/WebP/SVG up to 200 KiB. The store applies HTML data attributes and browser theme-color; initialization includes an index-page preference read before first paint.

## 5. Invariants

Tokens are not attached to external domains. Auth-disabled development allows protected routes. Password-recovery route is intentionally accessible without authGuard. Existing URLs and provider configuration field names remain unchanged.

## 6. Dependencies

Depends on Router, HttpClient interception, supabase-js, browser media queries/FileReader/storage and the public-config endpoint. Appearance derives user scope from AuthService.

## 7. Data and state

Session/user are signals mirrored from Supabase. Refresh has one shared in-flight promise. Appearance persists under per-user keys plus `checkpoint:appearance:last`; an unknown user's preferences start from current appearance. Appearance is browser-local and is not written to the API. Logout storage cleanup targets data-cache prefixes, not appearance or previous-desire storage.

## 8. Source references

`AuthService.init`, `accessToken`, `refreshToken`, `signOut`; `authGuard`, `guestGuard`, `safeRedirect`; `authInterceptor`, `retry`; `Login.submit`; `AppearanceStore`, `sanitize`, `readLogoFile`; `Logo.choice` in the source paths above.

## 9. Related documentation

[Frontend root](../front-end-architecture.md), [Security](../security-architecture.md), [Cache](../cache-architecture.md), [Identity domain](../domains/identity/domain.md).

## 10. Evidence and uncertainties

VERIFIED from inspected source. UNKNOWN: deployed OAuth settings, redirect allowlists and live session lifecycle. The store uses browser persistence rather than cross-device appearance synchronization. No frontend auth interaction tests were found.
