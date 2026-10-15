import type { CSSProperties, ReactNode } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import type { LogoChoice } from '../appearance/appearance';
import { Bonfire } from '../features/immediate/Bonfire';

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
