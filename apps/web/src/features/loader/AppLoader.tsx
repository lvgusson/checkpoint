import { Loader, registerLoaderArt, type LoaderProps } from '@checkpoint/ui-react';
import { SwordArt } from './SwordArt';

registerLoaderArt('sword', SwordArt);

/**
 * The app's loader: the kit's `Loader` with standard circular spinner as default art.
 * Pass `variant="sword"` explicitly for initial list-loading art.
 * `VITE_LOADER_ART` can override the default art when provided.
 */
export function AppLoader({
  label = 'Carregando…',
  variant = import.meta.env.VITE_LOADER_ART || undefined,
  ...rest
}: LoaderProps) {
  return <Loader label={label} variant={variant} {...rest} />;
}
