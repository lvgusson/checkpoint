export function FinishIcon({ withFlagDetail }: { withFlagDetail?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[22px]">
      <path
        d="M5 21V4m0 0h13l-2.5 4L18 12H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {withFlagDetail && <path d="M8 4h3v4H8zm3 4h3v4h-3z" fill="currentColor" />}
    </svg>
  );
}
