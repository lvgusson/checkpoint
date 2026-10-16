import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { useAppearance } from '../../appearance/AppearanceProvider';
import {
  ACCENTS,
  LOGOS,
  readLogoFile,
  type LogoChoice,
  type ThemeChoice,
} from '../../appearance/appearance';
import { Logo } from '../../app/Logo';
import './appearance.css';

const THEMES: { id: ThemeChoice; label: string; hint: string }[] = [
  { id: 'system', label: 'Sistema', hint: 'Segue o celular' },
  { id: 'light', label: 'Claro', hint: 'Sempre claro' },
  { id: 'dark', label: 'Escuro', hint: 'Sempre escuro' },
];

/** One radio card; the native radio stays in the DOM (visually hidden) for keyboard and screen readers. */
function Choice({
  name,
  value,
  selected,
  onSelect,
  className = '',
  children,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect(): void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`choice ${className} ${selected ? 'selected' : ''}`}>
      <input
        data-testid={`settings-${name}-${value}`}
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
      />
      {children}
    </label>
  );
}

/** Theme, accent, logo and account. Everything applies immediately (no save button). */
export function AppearanceScreen() {
  const { value, resolved, update, reset } = useAppearance();
  const { user, signOut } = useAuth();
  const [logoError, setLogoError] = useState('');

  const setLogo = (logo: LogoChoice) => {
    setLogoError('');
    update({ logo });
  };
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setLogoError('');
    try {
      update({ customLogo: await readLogoFile(file), logo: 'custom' });
    } catch (err) {
      setLogoError((err as Error).message);
    }
  };

  return (
    <div className="appearance">
      <div className="page-heading">
        <div>
          <h1>
            Aparência<span className="heading-dot">.</span>
          </h1>
          <p>Tema, cor e logo deste navegador. As mudanças valem na hora.</p>
        </div>
      </div>

      <section className="panel">
        <fieldset>
          <legend>
            <h2>Tema</h2>
          </legend>
          <div className="choices three">
            {THEMES.map((t) => (
              <Choice
                key={t.id}
                name="theme"
                value={t.id}
                selected={value.theme === t.id}
                onSelect={() => update({ theme: t.id })}
              >
                <span className="theme-preview" data-preview={t.id} aria-hidden="true">
                  <i />
                  <i />
                </span>
                <span className="choice-label">{t.label}</span>
                <small>{t.hint}</small>
              </Choice>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="panel">
        <fieldset>
          <legend>
            <h2>Cor de destaque</h2>
          </legend>
          <div className="choices swatches">
            {ACCENTS.map((a) => (
              <Choice
                key={a.id}
                name="accent"
                value={a.id}
                className="swatch"
                selected={value.accent === a.id}
                onSelect={() => update({ accent: a.id })}
              >
                <span
                  className="dot"
                  aria-hidden="true"
                  style={{ background: resolved === 'dark' ? a.dark : a.light }}
                />
                <span className="choice-label">{a.label}</span>
              </Choice>
            ))}
          </div>
          <div className="sample" aria-hidden="true">
            <span className="button primary">Botão principal</span>
            <span className="chip">Fixado</span>
            <span className="score">
              87 <small>pontos</small>
            </span>
          </div>
        </fieldset>
      </section>

      <section className="panel">
        <fieldset>
          <legend>
            <h2>Logo</h2>
          </legend>
          <div className="choices logos">
            {LOGOS.map((l) => (
              <Choice
                key={l.id}
                name="logo"
                value={l.id}
                className="logo-choice"
                selected={value.logo === l.id}
                onSelect={() => setLogo(l.id)}
              >
                <span className="logo-slot">
                  <Logo variant={l.id} />
                </span>
                <span className="choice-label">{l.label}</span>
              </Choice>
            ))}
            {value.customLogo && (
              <Choice
                name="logo"
                value="custom"
                className="logo-choice"
                selected={value.logo === 'custom'}
                onSelect={() => setLogo('custom')}
              >
                <span className="logo-slot">
                  <Logo variant="custom" />
                </span>
                <span className="choice-label">Sua imagem</span>
              </Choice>
            )}
          </div>
          <div className="upload">
            <label className="button">
              Enviar imagem
              <input
                data-testid="settings-logo-upload"
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => void upload(e)}
              />
            </label>
            {value.customLogo && (
              <button
                data-testid="settings-logo-remove"
                type="button"
                className="button"
                onClick={() => update({ customLogo: null, logo: 'bonfire' })}
              >
                Remover imagem
              </button>
            )}
            <small>PNG, JPG, WebP ou SVG, até 200 KB. Quadrada fica melhor.</small>
          </div>
          {logoError && (
            <p className="form-error" role="alert">
              {logoError}
            </p>
          )}
        </fieldset>
      </section>

      <section className="panel account">
        <h2>Conta</h2>
        <p className="muted">{user ? user.email : 'Modo local, sem login.'}</p>
        <div className="row">
          {user && (
            <button
              data-testid="settings-logout"
              type="button"
              className="button"
              onClick={() => void signOut()}
            >
              Sair
            </button>
          )}
          <button
            data-testid="settings-appearance-reset"
            type="button"
            className="button"
            onClick={reset}
          >
            Restaurar aparência padrão
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Biblioteca de Componentes</h2>
        <p className="muted">Catálogo de componentes UI e playground de propriedades.</p>
        <div className="row">
          <Link to="/componentes" className="button" data-testid="link-component-catalog">
            Biblioteca de Componentes ↗
          </Link>
        </div>
      </section>
    </div>
  );
}
