import { Loader, registerLoaderArt, type LoaderProps } from '@checkpoint/ui-react';
import { SwordArt } from './SwordArt';

registerLoaderArt('sword', SwordArt);

/**
 * The app's loader: the kit's `Loader` with bonfire sword as default art for stacked loaders,
 * and standard circular spinner when layout === 'inline' (buttons / small indicators).
 * `VITE_LOADER_ART` can override the default art when provided.
 */
export function AppLoader({
  label = 'Carregando…',
  variant,
  layout = 'stacked',
  ...rest
}: LoaderProps) {
  const defaultVariant = layout === 'inline' ? 'spinner' : 'sword';
  const resolvedVariant = variant ?? (import.meta.env.VITE_LOADER_ART || defaultVariant);
  return <Loader label={label} variant={resolvedVariant} layout={layout} {...rest} />;
}
