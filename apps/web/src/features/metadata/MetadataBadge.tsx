import type { CSSProperties } from 'react';
import { metadataPresentation, type MetadataKind } from './presentation';

/** Colored badge with the icon for a metadata value. */
export function MetadataBadge({
  kind,
  value,
  className = '',
}: {
  kind: MetadataKind;
  value: string;
  className?: string;
}) {
  const { color, icon } = metadataPresentation(kind, value);
  return (
    <span
      className={`badge metadata-badge inline-flex items-center gap-[5px] ${className}`}
      style={{ '--metadata-color': color } as CSSProperties}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5 shrink-0 fill-current stroke-none"
      >
        <path d={icon} />
      </svg>
      {value}
    </span>
  );
}
