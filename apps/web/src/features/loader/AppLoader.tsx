import { Loader, registerLoaderArt, type LoaderProps } from '@checkpoint/ui-react';
import { SwordArt } from './SwordArt';

registerLoaderArt('sword', SwordArt);

/**
 * The app's loader: the kit's `Loader` with this product's art. `VITE_LOADER_ART` names the
 * default art (`sword` when unset). Pass `variant`, `art` or `src` to override it per use.
 */
export function AppLoader({
  label = 'Carregando…',
  variant = import.meta.env.VITE_LOADER_ART || 'sword',
  ...rest
}: LoaderProps) {
  return <Loader label={label} variant={variant} {...rest} />;
}
