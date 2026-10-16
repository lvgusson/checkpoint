import type { ComponentType, ReactNode } from 'react';

export type LoaderSize = number | 'sm' | 'md' | 'lg';
export type LoaderArtComponent = ComponentType<{ size: number }>;

export interface LoaderProps {
  /** Text under (or beside) the art. Also the accessible name. */
  label?: string;
  /** Any custom animation. Wins over `src` and `variant`. */
  art?: ReactNode;
  /** URL or path of an SVG or image, drawn as `<img alt="">`. */
  src?: string;
  /** Name of art added with `registerLoaderArt`. Unknown names fall back to the spinner. */
  variant?: string;
  size?: LoaderSize;
  /** `stacked` puts the art above the label (default); `inline` puts them side by side. */
  layout?: 'stacked' | 'inline';
  /** `inline` hugs the content, `block` fills the width, `screen` centers in the viewport. */
  fill?: 'inline' | 'block' | 'screen';
  'data-testid'?: string;
}

const SIZES = { sm: 20, md: 40, lg: 64 } as const;
const registry = new Map<string, ReactNode | LoaderArtComponent>();

/** Adds a named art for `variant`. Pass an element, or a component that receives `size` in px. */
export function registerLoaderArt(name: string, art: ReactNode | LoaderArtComponent) {
  registry.set(name, art);
}

// `precedence` makes React 19 emit this tag once, however many loaders render.
const CSS = `
.ckl{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;color:inherit}
.ckl--stacked{flex-direction:column;gap:.75rem}
.ckl--inline{flex-direction:row}
.ckl--block{display:flex;width:100%;padding:1.5rem 0}
.ckl--screen{display:flex;width:100%;min-height:100vh;min-height:100dvh}
.ckl__art{display:inline-flex;align-items:center;justify-content:center;flex:none}
.ckl__art>img,.ckl__art>svg{width:100%;height:100%}
.ckl__label{font-size:.875rem;opacity:.75}
.ckl__spinner{width:100%;height:100%;box-sizing:border-box;border-radius:50%;border:.15em solid currentColor;border-right-color:transparent;opacity:.7;animation:ckl-spin .8s linear infinite}
@keyframes ckl-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ckl__spinner{animation:none}}
`;

function pickArt(props: LoaderProps, px: number): ReactNode {
  if (props.art) return props.art;
  if (props.src) return <img src={props.src} alt="" />;
  const named = props.variant ? registry.get(props.variant) : undefined;
  if (typeof named === 'function') {
    const Art = named as LoaderArtComponent;
    return <Art size={px} />;
  }
  return named ?? <span className="ckl__spinner" />;
}

/** Product-agnostic loading indicator: art plus an optional phrase, announced as a status. */
export function Loader(props: LoaderProps) {
  const { label, size = 'md', layout = 'stacked', fill = 'inline' } = props;
  const px = typeof size === 'number' ? size : SIZES[size];
  return (
    <div
      className={`ckl ckl--${layout} ckl--${fill}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || undefined}
      data-testid={props['data-testid']}
    >
      <style href="ckl-loader" precedence="default">
        {CSS}
      </style>
      <span className="ckl__art" style={{ width: px, height: px }} aria-hidden="true">
        {pickArt(props, px)}
      </span>
      {label && <span className="ckl__label">{label}</span>}
    </div>
  );
}
