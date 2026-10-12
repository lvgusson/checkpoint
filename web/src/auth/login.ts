import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, type AuthResult } from './auth.service';
import { safeRedirect } from './auth.guard';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

const titles: Record<Mode, [string, string, string]> = {
  login: ['BEM-VINDO DE VOLTA', 'Entrar', 'Sua biblioteca está esperando a próxima partida.'],
  signup: ['COMECE SUA BIBLIOTECA', 'Criar conta', 'Organize o que jogar, no seu ritmo.'],
  forgot: [
    'ACONTECE COM TODO MUNDO',
    'Esqueci a senha',
    'Enviaremos um link para você criar uma nova senha.',
  ],
  reset: ['QUASE LÁ', 'Nova senha', 'Escolha uma senha nova para sua conta.'],
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `<div class="auth-page">
    <section class="auth-card">
      <div class="auth-brand">
        <span class="brand-mark">C<span>•</span></span>
        <span>checkpoint<small>SUA BIBLIOTECA, SEU RITMO</small></span>
      </div>
      <span class="eyebrow">{{ title()[0] }}</span>
      <h1>{{ title()[1] }}<span class="heading-dot">.</span></h1>
      <p class="muted">{{ title()[2] }}</p>

      @if (mode() === 'login' || mode() === 'signup') {
        <div class="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [class.active]="mode() === 'login'"
            [attr.aria-selected]="mode() === 'login'"
            (click)="switch('login')"
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            [class.active]="mode() === 'signup'"
            [attr.aria-selected]="mode() === 'signup'"
            (click)="switch('signup')"
          >
            Criar conta
          </button>
        </div>
      }

      @if (mode() === 'reset' && !auth.session()) {
        <p class="error" role="alert">
          Link inválido ou expirado. Peça um novo link de redefinição.
        </p>
        <button type="button" class="button primary wide" (click)="switch('forgot')">
          Pedir novo link
        </button>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (mode() !== 'reset') {
            <label class="field" for="auth-email">
              <span>E-mail</span>
              <input
                id="auth-email"
                type="email"
                formControlName="email"
                autocomplete="email"
                placeholder="voce@exemplo.com"
                [attr.aria-invalid]="invalid('email')"
              />
            </label>
            @if (invalid('email')) {
              <small class="field-error">Informe um e-mail válido.</small>
            }
          }
          @if (mode() !== 'forgot') {
            <label class="field" for="auth-password">
              <span>{{ mode() === 'reset' ? 'Nova senha' : 'Senha' }}</span>
              <input
                id="auth-password"
                type="password"
                formControlName="password"
                [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
                placeholder="Mínimo de 8 caracteres"
                [attr.aria-invalid]="invalid('password')"
              />
            </label>
            @if (invalid('password')) {
              <small class="field-error">A senha precisa ter pelo menos 8 caracteres.</small>
            }
          }
          @if (mode() === 'signup' || mode() === 'reset') {
            <label class="field" for="auth-confirm">
              <span>Confirmar senha</span>
              <input
                id="auth-confirm"
                type="password"
                formControlName="confirm"
                autocomplete="new-password"
                [attr.aria-invalid]="mismatch()"
              />
            </label>
            @if (mismatch()) {
              <small class="field-error">As senhas não conferem.</small>
            }
          }
          @if (mode() === 'login') {
            <button type="button" class="link" (click)="switch('forgot')">Esqueci a senha</button>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          @if (notice()) {
            <p class="notice" role="status">{{ notice() }}</p>
          }
          <button class="button primary wide" type="submit" [disabled]="loading()">
            {{ loading() ? 'Aguarde…' : submitLabel() }}
          </button>
        </form>
      }

      @if (mode() === 'forgot') {
        <button type="button" class="link center" (click)="switch('login')">
          ← Voltar para o login
        </button>
      }
      @if (auth.githubEnabled() && (mode() === 'login' || mode() === 'signup')) {
        <div class="divider"><span>ou</span></div>
        <button type="button" class="button wide" [disabled]="loading()" (click)="github()">
          Continuar com GitHub
        </button>
      }
      @if (auth.initError()) {
        <p class="error" role="alert">{{ auth.initError() }}</p>
      }
    </section>
  </div>`,
  styles: `
    .auth-page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px 16px;
      background: radial-gradient(circle at 20% 0%, var(--accent-soft), transparent 55%), var(--bg);
    }
    .auth-card {
      width: 100%;
      max-width: 410px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 34px 32px;
      box-shadow: 0 18px 40px var(--shadow-soft);
    }
    .auth-brand {
      display: flex;
      gap: 12px;
      align-items: center;
      font:
        800 23px Manrope,
        sans-serif;
      letter-spacing: -1px;
      margin-bottom: 30px;
    }
    .auth-brand small {
      display: block;
      font:
        600 8px 'DM Sans',
        sans-serif;
      letter-spacing: 1.3px;
      margin-top: 5px;
      color: var(--muted);
    }
    h1 {
      font-size: 30px;
    }
    p.muted {
      font-size: 13px;
      margin: 0 0 22px;
    }
    .auth-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--surface-2);
      border-radius: 9px;
      padding: 4px;
      margin-bottom: 20px;
    }
    .auth-tabs button {
      border: 0;
      background: none;
      padding: 9px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
    }
    .auth-tabs button.active {
      background: var(--surface);
      color: var(--accent);
      box-shadow: 0 1px 3px var(--shadow-soft);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-2);
    }
    .field input {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 11px 12px;
      font-size: 14px;
      background: var(--surface);
    }
    .field input[aria-invalid='true'] {
      border-color: var(--danger-line);
    }
    .field-error {
      color: var(--danger);
      font-size: 11px;
    }
    .link {
      align-self: flex-end;
      background: none;
      border: 0;
      padding: 4px 0;
      font-size: 12px;
      color: var(--accent);
      font-weight: 600;
    }
    .link.center {
      display: block;
      margin: 16px auto 0;
    }
    .error,
    .notice {
      margin: 10px 0 0;
    }
    .notice {
      background: var(--accent-soft);
      color: var(--accent-ink);
      border: 1px solid var(--accent-line);
      border-radius: 8px;
      padding: 14px 16px;
      font-size: 13px;
    }
    .wide {
      width: 100%;
      margin-top: 14px;
      padding: 13px 16px;
      font-size: 13px;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 22px 0 0;
      color: var(--muted);
      font-size: 11px;
    }
    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      border-top: 1px solid var(--border);
    }
    @media (max-width: 480px) {
      .auth-card {
        padding: 28px 20px;
      }
    }
  `,
})
export class Login {
  protected auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly mode = signal<Mode>(this.route.snapshot.data['mode'] ?? 'login');
  readonly title = computed(() => titles[this.mode()]);
  readonly submitLabel = computed(
    () =>
      ({
        login: 'Entrar',
        signup: 'Criar conta',
        forgot: 'Enviar link',
        reset: 'Salvar nova senha',
      })[this.mode()],
  );
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private submitted = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: [''],
  });

  invalid(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  mismatch(): boolean {
    const { password, confirm } = this.form.getRawValue();
    return (this.submitted() || this.form.controls.confirm.touched) && password !== confirm;
  }

  switch(mode: Mode) {
    this.mode.set(mode);
    this.submitted.set(false);
    this.error.set('');
    this.notice.set('');
  }

  async submit() {
    this.submitted.set(true);
    this.error.set('');
    this.notice.set('');
    const mode = this.mode();
    const { email, password } = this.form.getRawValue();
    const needs = {
      login: ['email', 'password'],
      signup: ['email', 'password'],
      forgot: ['email'],
      reset: ['password'],
    }[mode] as ('email' | 'password')[];
    if (needs.some((n) => this.form.controls[n].invalid)) return;
    if ((mode === 'signup' || mode === 'reset') && this.mismatch()) return;

    this.loading.set(true);
    let result: AuthResult;
    try {
      result =
        mode === 'login'
          ? await this.auth.signIn(email, password)
          : mode === 'signup'
            ? await this.auth.signUp(email, password)
            : mode === 'forgot'
              ? await this.auth.resetPassword(email)
              : await this.auth.updatePassword(password);
    } finally {
      this.loading.set(false);
    }
    if (!result.ok) return this.error.set(result.message);
    if (result.message) this.notice.set(result.message);
    if (this.auth.session() && mode !== 'forgot') {
      await this.router.navigateByUrl(
        safeRedirect(this.route.snapshot.queryParamMap.get('redirect')),
      );
    }
  }

  async github() {
    this.loading.set(true);
    const redirect = safeRedirect(this.route.snapshot.queryParamMap.get('redirect'));
    const result = await this.auth.signInWithGitHub(redirect);
    this.loading.set(false);
    if (!result.ok) this.error.set(result.message);
  }
}
