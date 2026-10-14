import { useEffect } from 'react';
import { isApiError } from '../api/errors';

/** Message safe to show to users for any thrown value. */
export const errorMessage = (error: unknown) =>
  isApiError(error) ? error.message : 'Algo deu errado. Tente de novo.';

type Listener = (message: string, error: unknown) => void;
const listeners = new Set<Listener>();

/** Called by the QueryClient caches for failures nobody handled locally. */
export function reportError(error: unknown) {
  const message = errorMessage(error);
  listeners.forEach((l) => l(message, error));
}

/** Central error hook: subscribe once (the app shell renders a toast) to see unhandled API errors. */
export function useUnhandledErrors(listener: Listener) {
  useEffect(() => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, [listener]);
}
