import type { User } from '@supabase/auth-js';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { authSession, type AuthState } from './session';

interface AuthValue extends AuthState {
  user: User | null;
  /** Stable identity used to scope query keys; 'local' when auth is disabled. */
  userId: string;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Initializes the session once, exposes it, and clears every cached query when the identity
 * changes (sign-out or user switch) so one user's data is never visible to another.
 * Renders nothing until init settles, like the Angular app initializer did.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(authSession.subscribe, authSession.getState);
  const queryClient = useQueryClient();
  const user = state.session?.user ?? null;
  const userId = user?.id ?? 'local';
  const previous = useRef(userId);

  useEffect(() => void authSession.init(), []);
  useEffect(() => {
    const old = previous.current;
    previous.current = userId;
    if (old === userId) return;
    // Drop only the previous identity's queries (keys start with the user id); the new user's stay.
    const ofOld = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === old };
    void queryClient.cancelQueries(ofOld).then(() => queryClient.removeQueries(ofOld));
    // Pending mutations of the old user must not report into the new session; the new user has none yet.
    queryClient.getMutationCache().clear();
  }, [userId, queryClient]);

  if (!state.ready) return null;
  return <AuthContext value={{ ...state, user, userId }}>{children}</AuthContext>;
}

export function useAuth(): AuthValue & typeof actions {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return { ...value, ...actions };
}

const actions = {
  signIn: authSession.signIn.bind(authSession),
  signUp: authSession.signUp.bind(authSession),
  resetPassword: authSession.resetPassword.bind(authSession),
  updatePassword: authSession.updatePassword.bind(authSession),
  signInWithGitHub: authSession.signInWithGitHub.bind(authSession),
  signOut: authSession.signOut.bind(authSession),
};
