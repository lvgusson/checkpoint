import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  BAR,
  DEFAULTS,
  LAST_KEY,
  PREFIX,
  read,
  sanitize,
  write,
  type Appearance,
} from './appearance';

interface AppearanceValue {
  value: Appearance;
  /** Effective theme ("system" resolved). */
  resolved: 'light' | 'dark';
  update(patch: Partial<Appearance>): void;
  reset(): void;
}

const AppearanceContext = createContext<AppearanceValue | null>(null);
const darkQuery = () =>
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [value, setValue] = useState<Appearance>(() => read(LAST_KEY) ?? DEFAULTS);
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);
  const [owner, setOwner] = useState<string | null>(null);
  const [carried, setCarried] = useState(false);

  useEffect(() => {
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query?.addEventListener('change', onChange);
    return () => query?.removeEventListener('change', onChange);
  }, []);

  // User switch: load that user's appearance (or keep the current one as the starting point).
  // Adjusted during render (not in an effect) so the new user's theme never flashes the old one.
  if (owner !== userId) {
    setOwner(userId);
    const mine = read(PREFIX + userId);
    if (mine) setValue(mine);
    // Without a saved choice the carried-over value belongs to the previous user: do not persist it for this one.
    setCarried(!mine);
  }

  const resolved = value.theme === 'system' ? (systemDark ? 'dark' : 'light') : value.theme;
  useEffect(() => {
    const html = document.documentElement;
    html.dataset['theme'] = resolved;
    html.dataset['accent'] = value.accent;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[resolved]);
    write(LAST_KEY, value);
    if (owner && !carried) write(PREFIX + owner, value);
  }, [value, resolved, owner, carried]);

  const update = useCallback((patch: Partial<Appearance>) => {
    setCarried(false);
    setValue((v) => sanitize({ ...v, ...patch }));
  }, []);
  const reset = useCallback(() => {
    setCarried(false);
    setValue(DEFAULTS);
  }, []);
  const ctx = useMemo(() => ({ value, resolved, update, reset }), [value, resolved, update, reset]);
  return <AppearanceContext value={ctx}>{children}</AppearanceContext>;
}

export function useAppearance(): AppearanceValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used inside AppearanceProvider');
  return ctx;
}
