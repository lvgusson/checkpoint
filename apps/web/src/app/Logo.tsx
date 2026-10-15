import type { CSSProperties, ReactNode } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import type { LogoChoice } from '../appearance/appearance';

/** Application bonfire icon; `mono` uses currentColor without a background. */
export function Bonfire({ mono = false }: { mono?: boolean }) {
  const f = (color: string, opacity?: number) => ({
    fill: mono ? 'currentColor' : color,
    opacity: mono ? opacity : undefined,
  });
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {!mono && <rect width="64" height="64" rx="14" fill="#1a1030" />}
      <path
        style={f('#ff7a3d', 0.55)}
        d="M32 24c6 7 17 11 17 22 0 6-7 9-17 9s-17-3-17-9c0-7 4-10 7-16 1 5 3 7 6 8 0-6 1-10 4-14z"
      />
      <path style={f('#e9e5f5')} d="M27.5 20h9v28l-4.5 6.5-4.5-6.5z" />
      <path style={f('#b9b0d6', 0.7)} d="M32 20h4.5v28L32 54.5z" />
      <rect style={f('#f2b84b')} x="16" y="16" width="32" height="6.5" rx="3.2" />
      <rect style={f('#c98a2b')} x="29" y="9" width="6" height="8" />
      <circle style={f('#f2b84b')} cx="32" cy="8" r="4.5" />
      <path
        style={f('#ffc857', 0.25)}
        d="M32 36c3.5 4.5 9 7 9 12.5 0 4.5-4.5 6.5-9 6.5s-9-2-9-6.5c0-5.5 5.5-8 9-12.5z"
      />
      <path style={f('#5b3f8c', 0.35)} d="M10 57c5-5 13-7 22-7s17 2 22 7z" />
    </svg>
  );
}

const box = (children: ReactNode, extra?: string) => (
  <svg viewBox="0 0 40 40" aria-hidden="true" shapeRendering={extra as 'crispEdges' | undefined}>
    <rect width="40" height="40" rx="11" fill="var(--accent)" />
    {children}
  </svg>
);
const on = 'var(--on-accent)';

/** Checkpoint brand mark. `variant` previews a specific choice (appearance screen). */
export function Logo({ variant }: { variant?: LogoChoice | null }) {
  const { value } = useAppearance();
  const choice = variant ?? value.logo;
  const style = {
    display: 'inline-grid',
    flexShrink: 0,
    width: 'var(--logo-size, 38px)',
    height: 'var(--logo-size, 38px)',
    '--bonfire-size': '100%',
  } as CSSProperties;
  return (
    <span style={style}>
      {choice === 'bonfire' && <Bonfire />}
      {choice === 'custom' && (
        <img
          className="logo-img"
          src={value.customLogo ?? ''}
          alt=""
          style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover' }}
        />
      )}
      {choice === 'flag' &&
        box(
          <>
            <path d="M14 30V10" stroke={on} strokeWidth="3" strokeLinecap="round" />
            <path d="M15.5 11h12l-3.2 4.6L27.5 20h-12z" fill={on} />
          </>,
        )}
      {choice === 'ring' &&
        box(
          <>
            <circle cx="20" cy="20" r="10.5" fill="none" stroke={on} strokeWidth="3" />
            <path
              d="M15.5 20.4l3.2 3.2 6-6.4"
              fill="none"
              stroke={on}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>,
        )}
      {choice === 'pixel' &&
        box(
          <g fill={on}>
            <rect x="14" y="10" width="12" height="4" />
            <rect x="10" y="14" width="4" height="12" />
            <rect x="14" y="26" width="12" height="4" />
            <rect x="26" y="14" width="4" height="4" />
            <rect x="26" y="22" width="4" height="4" />
          </g>,
          'crispEdges',
        )}
      {choice === 'monogram' &&
        box(
          <>
            <path
              d="M25.5 14.2a8.5 8.5 0 1 0 0 11.6"
              fill="none"
              stroke={on}
              strokeWidth="3.6"
              strokeLinecap="round"
            />
            <circle
              cx="29"
              cy="11"
              r="3"
              fill="var(--accent-bright)"
              stroke={on}
              strokeWidth="1.5"
            />
          </>,
        )}
    </span>
  );
}
