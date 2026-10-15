import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useAppearance } from '@/appearance/AppearanceProvider';

/** Toast host themed by the app's resolved theme (data-theme), not by next-themes. */
export function Toaster(props: ToasterProps) {
  const { resolved } = useAppearance();
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--surface)',
          '--normal-text': 'var(--text)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
