import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { safeRedirect } from '../auth/safeRedirect';
import type { AuthResult } from '../auth/session';
import { AppLoader } from '../features/loader/AppLoader';
import './login.css';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';
interface Fields {
  email: string;
  password: string;
  confirm: string;
}

const TITLES: Record<Mode, [string, string, string]> = {
  login: ['BEM-VINDO DE VOLTA', 'Entrar', 'Sua biblioteca está esperando a próxima partida.'],
  signup: ['COMECE SUA BIBLIOTECA', 'Criar conta', 'Organize o que jogar, no seu ritmo.'],
  forgot: [
    'ACONTECE COM TODO MUNDO',
    'Esqueci a senha',
    'Enviaremos um link para você criar uma nova senha.',
  ],
  reset: ['QUASE LÁ', 'Nova senha', 'Escolha uma senha nova para sua conta.'],
};
const SUBMIT: Record<Mode, string> = {
  login: 'Entrar',
  signup: 'Criar conta',
  forgot: 'Enviar link',
  reset: 'Salvar nova senha',
};

const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Serves /login (mode "login", switchable) and /redefinir-senha (mode "reset"). */
export function LoginPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const form = useForm<Fields>({ defaultValues: { email: '', password: '', confirm: '' } });
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = form;
  const redirect = safeRedirect(params.get('redirect'));
  const title = TITLES[mode];

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    reset(undefined, { keepValues: true });
  };

  async function submit({ email, password }: Fields) {
    setError('');
    setNotice('');
    setLoading(true);
    let result: AuthResult;
    try {
      result =
        mode === 'login'
          ? await auth.signIn(email, password)
          : mode === 'signup'
            ? await auth.signUp(email, password)
            : mode === 'forgot'
              ? await auth.resetPassword(email)
              : await auth.updatePassword(password);
    } finally {
      setLoading(false);
    }
    if (!result.ok) return setError(result.message);
    if (result.message) setNotice(result.message);
    // A sign-in resolves its session through onAuthStateChange; the guest route redirects on its own.
    if (mode !== 'forgot' && (mode === 'reset' || mode === 'signup'))
      void navigate(redirect, { replace: true });
  }

  async function github() {
    setLoading(true);
    const result = await auth.signInWithGitHub(redirect);
    setLoading(false);
    if (!result.ok) setError(result.message);
  }

  const emailRules = {
    required: true,
    validate: (v: string) => {
      const value = v.trim();
      // Usernames are accepted only for sign-in; registration and recovery require an email.
      return mode === 'login' && USERNAME.test(value) ? true : EMAIL.test(value);
    },
  };
  const tab = (id: 'login' | 'signup', label: string) => (
    <button
      data-testid={`login-tab-${id}`}
      type="button"
      role="tab"
      className={mode === id ? 'active' : undefined}
      aria-selected={mode === id}
      onClick={() => switchMode(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">
            C<span>•</span>
          </span>
          <span>
            checkpoint<small>SUA BIBLIOTECA, SEU RITMO</small>
          </span>
        </div>
        <span className="eyebrow">{title[0]}</span>
        <h1>
          {title[1]}
          <span className="heading-dot">.</span>
        </h1>
        <p className="muted">{title[2]}</p>

        {(mode === 'login' || mode === 'signup') && (
          <div className="auth-tabs" role="tablist">
            {tab('login', 'Entrar')}
            {tab('signup', 'Criar conta')}
          </div>
        )}

        {mode === 'reset' && !auth.session ? (
          <>
            <p className="error" role="alert">
              Link inválido ou expirado. Peça um novo link de redefinição.
            </p>
            <button
              data-testid="login-recovery-request"
              type="button"
              className="button primary wide"
              onClick={() => switchMode('forgot')}
            >
              Pedir novo link
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit(submit)} noValidate>
            {mode !== 'reset' && (
              <>
                <label className="field" htmlFor="auth-email">
                  <span>{mode === 'login' ? 'E-mail ou usuário' : 'E-mail'}</span>
                  <input
                    data-testid="login-email"
                    id="auth-email"
                    type={mode === 'login' ? 'text' : 'email'}
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoComplete={mode === 'login' ? 'username' : 'email'}
                    placeholder="voce@exemplo.com"
                    aria-invalid={!!errors.email}
                    {...register('email', emailRules)}
                  />
                </label>
                {errors.email && (
                  <small className="field-error">
                    {mode === 'login'
                      ? 'Informe um e-mail ou usuário válido.'
                      : 'Informe um e-mail válido.'}
                  </small>
                )}
              </>
            )}
            {mode !== 'forgot' && (
              <>
                <label className="field" htmlFor="auth-password">
                  <span>{mode === 'reset' ? 'Nova senha' : 'Senha'}</span>
                  <input
                    data-testid="login-password"
                    id="auth-password"
                    type="password"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder="Mínimo de 8 caracteres"
                    aria-invalid={!!errors.password}
                    {...register('password', { required: true, minLength: 8 })}
                  />
                </label>
                {errors.password && (
                  <small className="field-error">
                    A senha precisa ter pelo menos 8 caracteres.
                  </small>
                )}
              </>
            )}
            {(mode === 'signup' || mode === 'reset') && (
              <>
                <label className="field" htmlFor="auth-confirm">
                  <span>Confirmar senha</span>
                  <input
                    data-testid="login-confirm-password"
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm}
                    {...register('confirm', { validate: (v) => v === getValues('password') })}
                  />
                </label>
                {errors.confirm && <small className="field-error">As senhas não conferem.</small>}
              </>
            )}
            {mode === 'login' && (
              <button
                data-testid="login-forgot"
                type="button"
                className="link"
                onClick={() => switchMode('forgot')}
              >
                Esqueci a senha
              </button>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <button
              data-testid={`login-submit-${mode}`}
              className="button primary wide"
              type="submit"
              disabled={loading}
            >
              {loading ? <AppLoader layout="inline" size="sm" label="Aguarde…" /> : SUBMIT[mode]}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <button
            data-testid="login-back"
            type="button"
            className="link center"
            onClick={() => switchMode('login')}
          >
            ← Voltar para o login
          </button>
        )}
        {auth.githubEnabled && (mode === 'login' || mode === 'signup') && (
          <>
            <div className="divider">
              <span>ou</span>
            </div>
            <button
              data-testid="login-github"
              type="button"
              className="button wide"
              disabled={loading}
              onClick={() => void github()}
            >
              {loading ? (
                <AppLoader layout="inline" size="sm" label="Aguarde…" />
              ) : (
                'Continuar com GitHub'
              )}
            </button>
          </>
        )}
        {auth.initError && (
          <p className="error" role="alert">
            {auth.initError}
          </p>
        )}
      </section>
    </div>
  );
}
