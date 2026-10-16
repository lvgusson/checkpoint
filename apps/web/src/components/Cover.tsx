import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface CoverProps {
  name?: string;
  coverUrl?: string | null;
  game?: { name: string; coverUrl?: string | null; primaryGenre?: string };
  genre?: string;
  className?: string;
  lazy?: boolean;
  alt?: string;
  fallbackText?: string;
  badge?: React.ReactNode;
}

/** Unified cover component for displaying game artwork with responsive fallback initials. */
export function Cover({
  name: propName,
  coverUrl: propCoverUrl,
  game,
  genre: propGenre,
  className,
  lazy = true,
  alt = '',
  fallbackText,
  badge,
}: CoverProps) {
  const name = propName ?? game?.name ?? '';
  const coverUrl = propCoverUrl !== undefined ? propCoverUrl : game?.coverUrl;
  const genre = propGenre ?? game?.primaryGenre;
  const [broken, setBroken] = useState(false);
  const initial = fallbackText ?? (name ? name.trim().slice(0, 1).toUpperCase() : '?');

  return (
    <div className={cn('cover', className)} data-genre={genre} data-testid="game-cover">
      {coverUrl && !broken ? (
        <img
          src={coverUrl}
          alt={alt}
          loading={lazy ? 'lazy' : undefined}
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : null}
      <span className="cover-fallback select-none">{initial}</span>
      {badge}
    </div>
  );
}
