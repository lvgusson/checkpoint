import {
  GoTrueClient,
  type AuthChangeEvent,
  type AuthError,
  type Session,
} from '@supabase/auth-js';

/** GET /api/v1/config response (URL + publishable key are public by design). */
interface PublicConfig {
  auth: {
    supabaseUrl: string;
    supabasePublishableKey: string;
    providers: { github: boolean };
  } | null;
}

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

export interface AuthState {
  /** True once init() settled (config loaded and session restored, or failed). */
  ready: boolean;
  /** False when the API runs without Supabase (local development without auth). */
  enabled: boolean;
  githubEnabled: boolean;
  session: Session | null;
  initError: string;
}

/** Email alias domain for provisioned username accounts. */
const USERNAME_DOMAIN = 'gps.dev.br';

/**
 * Framework-free Supabase session holder (port of the Angular AuthService). It lives outside React
 * so the HTTP client can read tokens without hooks; React subscribes via `subscribe/getState`.
 * supabase-js persists the session and refreshes access tokens itself.
 */
export class AuthSession {
  private client?: GoTrueClient;
  private refreshing?: Promise<string | null>;
  private initializing?: Promise<void>;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: AuthChangeEvent) => void>();
  private state: AuthState = {
    ready: false,
    enabled: true,
    githubEnabled: false,
    session: null,
    initError: '',
  };

  get enabled() {
    return this.state.enabled;
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
  /** Raw auth events (PASSWORD_RECOVERY, SIGNED_OUT...) for navigation side effects. */
  onEvent(listener: (event: AuthChangeEvent) => void) {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }
  private set(patch: Partial<AuthState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Idempotent; call once at bootstrap before the first render of routes. */
  init(): Promise<void> {
    this.initializing ??= this.load().finally(() => this.set({ ready: true }));
    return this.initializing;
  }

  private async load() {
    let config: PublicConfig;
    try {
      // Raw fetch: the config endpoint must never go through the authenticated client.
      const res = await fetch('/api/v1/config');
      if (!res.ok) throw new Error(String(res.status));
      config = await res.json();
    } catch {
      this.set({
        initError: 'Não foi possível carregar a configuração. Verifique se a API está no ar.',
      });
      return;
    }
    if (!config.auth) return this.set({ enabled: false });
    this.set({ githubEnabled: config.auth.providers.github });
    const baseUrl = new URL(
      config.auth.supabaseUrl.endsWith('/')
        ? config.auth.supabaseUrl
        : `${config.auth.supabaseUrl}/`,
    );
    const authUrl = new URL('auth/v1', baseUrl).href;
    const storageKey = `sb-${baseUrl.hostname.split('.')[0]}-auth-token`;
    this.client = new GoTrueClient({
      url: authUrl,
      headers: {
        Authorization: `Bearer ${config.auth.supabasePublishableKey}`,
        apikey: config.auth.supabasePublishableKey,
      },
      storageKey,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    });
    // Do not call other auth methods inside this callback (it can deadlock the lock).
    this.client.onAuthStateChange((event, session) => {
      this.set({ session });
      this.eventListeners.forEach((l) => l(event));
    });
    const { data } = await this.client.getSession();
    this.set({ session: data.session });
  }

  /** getSession() reads storage and renews an expired token before returning it. */
  async accessToken(): Promise<string | null> {
    if (!this.client) return null;
    const { data } = await this.client.getSession();
    return data.session?.access_token ?? null;
  }

  /** Forces a refresh after a 401; concurrent callers share one promise. */
  refreshToken(): Promise<string | null> {
    if (!this.client) return Promise.resolve(null);
    this.refreshing ??= this.client
      .refreshSession()
      .then(({ data, error }) => (error ? null : (data.session?.access_token ?? null)))
      .catch(() => null)
      .finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  /** Accepts an email or maps a username to its lowercase email alias. */
  async signIn(login: string, password: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const id = login.trim();
    const email = id.includes('@') ? id : id.toLowerCase() + '@' + USERNAME_DOMAIN;
    const { error } = await this.client.signInWithPassword({ email, password });
    return error ? { ok: false, message: translate(error) } : { ok: true };
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { data, error } = await this.client.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + '/jogos' },
    });
    if (error) return { ok: false, message: translate(error) };
    // With email confirmation on, Supabase returns no session until the user confirms.
    return data.session
      ? { ok: true }
      : { ok: true, message: 'Conta criada! Confira seu e-mail para confirmar o cadastro.' };
  }

  async resetPassword(email: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { error } = await this.client.resetPasswordForEmail(email, {
      redirectTo: location.origin + '/redefinir-senha',
    });
    return error
      ? { ok: false, message: translate(error) }
      : {
          ok: true,
          message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.',
        };
  }

  async updatePassword(password: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { error } = await this.client.updateUser({ password });
    return error
      ? { ok: false, message: translate(error) }
      : { ok: true, message: 'Senha alterada.' };
  }

  async signInWithGitHub(redirect = '/jogos'): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { error } = await this.client.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.origin + redirect },
    });
    return error ? { ok: false, message: translate(error) } : { ok: true };
  }

  /** The SIGNED_OUT event drives the redirect to /login and the query cache reset. */
  async signOut(scope: 'global' | 'local' = 'local'): Promise<void> {
    await this.client?.signOut({ scope });
  }

  private unavailable(): AuthResult {
    return { ok: false, message: this.state.initError || 'Autenticação indisponível.' };
  }
}

export const authSession = new AuthSession();

const messages: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).',
  user_already_exists: 'Este e-mail já está cadastrado.',
  email_exists: 'Este e-mail já está cadastrado.',
  weak_password: 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.',
  same_password: 'A nova senha precisa ser diferente da atual.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  signup_disabled: 'Novos cadastros estão desativados.',
  email_address_invalid: 'E-mail inválido.',
};

function translate(error: AuthError): string {
  return (
    (error.code && messages[error.code]) ||
    (error.status === 0
      ? 'Sem conexão com o servidor de autenticação.'
      : 'Não foi possível concluir: ' + error.message)
  );
}
