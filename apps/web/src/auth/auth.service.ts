import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  createClient,
  type AuthError,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { clearDataCache } from '../data-cache';

/** Resposta de GET /api/v1/config (URL + publishable key são públicas por design). */
interface PublicConfig {
  auth: {
    supabaseUrl: string;
    supabasePublishableKey: string;
    providers: { github: boolean };
  } | null;
}

export type AuthResult = { ok: true; message?: string } | { ok: false; message: string };

/**
 * Sessão do Supabase Auth exposta como signals.
 *
 * O supabase-js já persiste a sessão (localStorage) e renova o access token sozinho
 * (autoRefreshToken) — aqui só espelhamos o estado via onAuthStateChange
 * (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT, PASSWORD_RECOVERY...).
 */
/** Email alias domain for provisioned username accounts. */
const USERNAME_DOMAIN = 'gps.dev.br';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private router = inject(Router);
  private client?: SupabaseClient;
  private refreshing?: Promise<string | null>;

  /** false quando a API não tem Supabase configurado (dev local sem auth). */
  readonly enabled = signal(true);
  readonly githubEnabled = signal(false);
  readonly session = signal<Session | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly initError = signal('');

  /** Chamado uma vez no bootstrap (provideAppInitializer), antes da 1ª navegação. */
  async init(): Promise<void> {
    let config: PublicConfig;
    try {
      // fetch direto (não HttpClient) para não passar pelo interceptor de auth.
      const res = await fetch('/api/v1/config');
      if (!res.ok) throw new Error(String(res.status));
      config = await res.json();
    } catch {
      this.initError.set(
        'Não foi possível carregar a configuração. Verifique se a API está no ar.',
      );
      return;
    }
    if (!config.auth) {
      this.enabled.set(false);
      return;
    }
    this.githubEnabled.set(config.auth.providers.github);
    this.client = createClient(config.auth.supabaseUrl, config.auth.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    // Não chamar outros métodos do supabase.auth dentro deste callback (pode travar o lock).
    this.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') void this.router.navigateByUrl('/redefinir-senha');
      if (event === 'SIGNED_OUT') clearDataCache();
      if (event === 'SIGNED_OUT' && !this.router.url.startsWith('/login'))
        void this.router.navigate(['/login'], { queryParams: { redirect: this.router.url } });
    });
    const { data } = await this.client.auth.getSession();
    this.session.set(data.session);
  }

  /**
   * Access token atual. getSession() lê do storage e, se o token já expirou (ex.: aba
   * suspensa), o próprio supabase-js renova antes de devolver.
   */
  async accessToken(): Promise<string | null> {
    if (!this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /** Força um refresh (após 401). Chamadas simultâneas compartilham a mesma promise. */
  refreshToken(): Promise<string | null> {
    if (!this.client) return Promise.resolve(null);
    this.refreshing ??= this.client.auth
      .refreshSession()
      .then(({ data, error }) => (error ? null : (data.session?.access_token ?? null)))
      .catch(() => null)
      .finally(() => (this.refreshing = undefined));
    return this.refreshing;
  }

  /** Accept email or map a username to its lowercase email alias. */
  async signIn(login: string, password: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const id = login.trim();
    const email = id.includes('@') ? id : id.toLowerCase() + '@' + USERNAME_DOMAIN;
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    return error ? { ok: false, message: translate(error) } : { ok: true };
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + '/jogos' },
    });
    if (error) return { ok: false, message: translate(error) };
    // Com confirmação de e-mail ativa, o Supabase não devolve sessão até o usuário confirmar.
    return data.session
      ? { ok: true }
      : { ok: true, message: 'Conta criada! Confira seu e-mail para confirmar o cadastro.' };
  }

  async resetPassword(email: string): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
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
    const { error } = await this.client.auth.updateUser({ password });
    return error
      ? { ok: false, message: translate(error) }
      : { ok: true, message: 'Senha alterada.' };
  }

  /** OAuth GitHub (só aparece se AUTH_GITHUB_ENABLED=true na API e o provider estiver ativo no painel). */
  async signInWithGitHub(redirect = '/jogos'): Promise<AuthResult> {
    if (!this.client) return this.unavailable();
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: location.origin + redirect },
    });
    return error ? { ok: false, message: translate(error) } : { ok: true };
  }

  /** Encerra a sessão; o redirecionamento para /login acontece no evento SIGNED_OUT. */
  async signOut(scope: 'global' | 'local' = 'local'): Promise<void> {
    clearDataCache();
    await this.client?.auth.signOut({ scope });
  }

  private unavailable(): AuthResult {
    return { ok: false, message: this.initError() || 'Autenticação indisponível.' };
  }
}

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
