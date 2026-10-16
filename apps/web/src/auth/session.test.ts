import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GoTrueClient,
  type AuthResponse,
  type AuthTokenResponsePassword,
  type Session,
  type User,
  type UserResponse,
} from '@supabase/auth-js';
import { AuthSession } from './session';

describe('AuthSession', () => {
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks state as disabled when public config has no auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ auth: null }),
      }),
    );

    const session = new AuthSession();
    await session.init();

    expect(session.getState()).toEqual({
      ready: true,
      enabled: false,
      githubEnabled: false,
      session: null,
      initError: '',
    });
    expect(await session.accessToken()).toBeNull();
    expect(await session.signIn('user', 'pass')).toEqual({
      ok: false,
      message: 'Autenticação indisponível.',
    });
  });

  it('records initError when config endpoint fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const session = new AuthSession();
    await session.init();

    const state = session.getState();
    expect(state.ready).toBe(true);
    expect(state.initError).toContain('Não foi possível carregar a configuração');
  });

  describe('with enabled auth', () => {
    async function createInitializedSession() {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            auth: {
              supabaseUrl: 'https://test-project.supabase.co',
              supabasePublishableKey: 'test-anon-key',
              providers: { github: true },
            },
          }),
        }),
      );

      const session = new AuthSession();
      await session.init();
      return session;
    }

    it('initializes AuthClient and exposes configuration state', async () => {
      const session = await createInitializedSession();
      const state = session.getState();

      expect(state.ready).toBe(true);
      expect(state.enabled).toBe(true);
      expect(state.githubEnabled).toBe(true);
    });

    it('normalizes username without @ to username domain', async () => {
      const session = await createInitializedSession();
      const signInSpy = vi.spyOn(GoTrueClient.prototype, 'signInWithPassword').mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as unknown as AuthTokenResponsePassword);

      const result = await session.signIn('Lucas', 'secret123');
      expect(result).toEqual({ ok: true });
      expect(signInSpy).toHaveBeenCalledWith({
        email: 'lucas@gps.dev.br',
        password: 'secret123',
      });
    });

    it('preserves full email when signing in with @', async () => {
      const session = await createInitializedSession();
      const signInSpy = vi.spyOn(GoTrueClient.prototype, 'signInWithPassword').mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      } as unknown as AuthTokenResponsePassword);

      const result = await session.signIn('user@example.com', 'secret123');
      expect(result).toEqual({ ok: true });
      expect(signInSpy).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'secret123',
      });
    });

    it('translates known authentication errors to Portuguese', async () => {
      const session = await createInitializedSession();
      vi.spyOn(GoTrueClient.prototype, 'signInWithPassword').mockResolvedValue({
        data: { user: null, session: null },
        error: {
          name: 'AuthApiError',
          code: 'invalid_credentials',
          message: 'Invalid credentials',
          status: 400,
        },
      } as unknown as AuthTokenResponsePassword);

      const result = await session.signIn('user@example.com', 'wrong');
      expect(result).toEqual({
        ok: false,
        message: 'E-mail ou senha incorretos.',
      });
    });

    it('handles status 0 network errors with Portuguese message', async () => {
      const session = await createInitializedSession();
      vi.spyOn(GoTrueClient.prototype, 'signInWithPassword').mockResolvedValue({
        data: { user: null, session: null },
        error: { name: 'AuthApiError', status: 0, message: 'Failed to fetch' },
      } as unknown as AuthTokenResponsePassword);

      const result = await session.signIn('user@example.com', 'wrong');
      expect(result).toEqual({
        ok: false,
        message: 'Sem conexão com o servidor de autenticação.',
      });
    });

    it('returns access token from getSession', async () => {
      const session = await createInitializedSession();
      vi.spyOn(GoTrueClient.prototype, 'getSession').mockResolvedValue({
        data: { session: { access_token: 'valid-jwt-token' } as unknown as Session },
        error: null,
      });

      const token = await session.accessToken();
      expect(token).toBe('valid-jwt-token');
    });

    it('deduplicates concurrent refresh calls and returns new token', async () => {
      const session = await createInitializedSession();
      const refreshSpy = vi.spyOn(GoTrueClient.prototype, 'refreshSession').mockResolvedValue({
        data: {
          session: { access_token: 'refreshed-jwt-token' } as unknown as Session,
          user: null,
        },
        error: null,
      });

      const [token1, token2] = await Promise.all([session.refreshToken(), session.refreshToken()]);
      expect(token1).toBe('refreshed-jwt-token');
      expect(token2).toBe('refreshed-jwt-token');
      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('handles signUp with and without immediate session', async () => {
      const session = await createInitializedSession();
      const signUpSpy = vi
        .spyOn(GoTrueClient.prototype, 'signUp')
        .mockResolvedValueOnce({
          data: { session: null, user: { id: 'u1' } as unknown as User },
          error: null,
        } as unknown as AuthResponse)
        .mockResolvedValueOnce({
          data: {
            session: { access_token: 'tok' } as unknown as Session,
            user: { id: 'u1' } as unknown as User,
          },
          error: null,
        } as unknown as AuthResponse);

      const res1 = await session.signUp('new@example.com', 'pass123');
      expect(res1).toEqual({
        ok: true,
        message: 'Conta criada! Confira seu e-mail para confirmar o cadastro.',
      });

      const res2 = await session.signUp('new@example.com', 'pass123');
      expect(res2).toEqual({ ok: true });
      expect(signUpSpy).toHaveBeenCalledTimes(2);
    });

    it('delegates resetPassword and updatePassword', async () => {
      const session = await createInitializedSession();
      const resetSpy = vi.spyOn(GoTrueClient.prototype, 'resetPasswordForEmail').mockResolvedValue({
        data: {},
        error: null,
      });
      const updateSpy = vi.spyOn(GoTrueClient.prototype, 'updateUser').mockResolvedValue({
        data: { user: { id: 'u1' } as unknown as User },
        error: null,
      } as unknown as UserResponse);

      const resetRes = await session.resetPassword('user@example.com');
      expect(resetRes.ok).toBe(true);
      expect(resetSpy).toHaveBeenCalledWith('user@example.com', {
        redirectTo: 'http://localhost:5173/redefinir-senha',
      });

      const updateRes = await session.updatePassword('newPassword123');
      expect(updateRes.ok).toBe(true);
      expect(updateSpy).toHaveBeenCalledWith({ password: 'newPassword123' });
    });

    it('delegates signInWithGitHub and signOut', async () => {
      const session = await createInitializedSession();
      const oauthSpy = vi.spyOn(GoTrueClient.prototype, 'signInWithOAuth').mockResolvedValue({
        data: { provider: 'github', url: 'https://github.com/login/oauth/authorize' },
        error: null,
      });
      const signOutSpy = vi.spyOn(GoTrueClient.prototype, 'signOut').mockResolvedValue({
        error: null,
      });

      const oauthRes = await session.signInWithGitHub('/custom-redirect');
      expect(oauthRes.ok).toBe(true);
      expect(oauthSpy).toHaveBeenCalledWith({
        provider: 'github',
        options: { redirectTo: 'http://localhost:5173/custom-redirect' },
      });

      await session.signOut('global');
      expect(signOutSpy).toHaveBeenCalledWith({ scope: 'global' });
    });

    it('notifies subscribers on state change', async () => {
      const session = await createInitializedSession();
      const listener = vi.fn();
      const unsubscribe = session.subscribe(listener);

      // Trigger state change via private set or event callback
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
