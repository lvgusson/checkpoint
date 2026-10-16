import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { LoginPage } from './LoginPage';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    userId: 'local',
    ready: true,
    githubEnabled: false,
    initError: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    signInWithGitHub: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('LoginPage', () => {
  it('renders the bonfire sword brand mark instead of the old C letter', () => {
    const html = renderToString(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    // Old C mark should NOT be present
    expect(html).not.toContain('C<span>•</span>');
    // Bonfire mark should be rendered inside brand-mark
    expect(html).toContain('brand-mark');
    expect(html).toContain('bonfire');
    expect(html).toContain('viewBox="0 0 64 64"');
  });

  it('renders accessible password toggle button and initial password input', () => {
    const html = renderToString(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    // Password input starts as type="password"
    expect(html).toContain('type="password"');
    expect(html).toContain('data-testid="login-password"');

    // Toggle button exists with type="button" and accessible label
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Mostrar"');
    expect(html).toContain('data-testid="login-password-toggle"');
  });
});
