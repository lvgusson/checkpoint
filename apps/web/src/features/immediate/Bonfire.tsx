import './bonfire.css';

/** Application bonfire icon; mono uses currentColor without a background, while the regular variant retains its palette. */
export function Bonfire({ mono = false }: { mono?: boolean }) {
  return (
    <span className={mono ? 'bonfire mono' : 'bonfire'}>
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        {!mono && <rect className="bg" width="64" height="64" rx="14" />}
        <path
          className="fire"
          d="M32 24c6 7 17 11 17 22 0 6-7 9-17 9s-17-3-17-9c0-7 4-10 7-16 1 5 3 7 6 8 0-6 1-10 4-14z"
        />
        <path className="blade" d="M27.5 20h9v28l-4.5 6.5-4.5-6.5z" />
        <path className="blade-shade" d="M32 20h4.5v28L32 54.5z" />
        <rect className="guard" x="16" y="16" width="32" height="6.5" rx="3.2" />
        <rect className="grip" x="29" y="9" width="6" height="8" />
        <circle className="guard" cx="32" cy="8" r="4.5" />
        <path
          className="core"
          d="M32 36c3.5 4.5 9 7 9 12.5 0 4.5-4.5 6.5-9 6.5s-9-2-9-6.5c0-5.5 5.5-8 9-12.5z"
        />
        <path className="ash" d="M10 57c5-5 13-7 22-7s17 2 22 7z" />
      </svg>
    </span>
  );
}
