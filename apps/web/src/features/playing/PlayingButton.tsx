import type { ScoredGame } from '../../../../../packages/core/src/models';
import { cn } from '@/lib/utils';
import { useGameWriter } from './gameWriter';

/** Toggle the persisted playing status without changing the game's priority. */
export function PlayingButton({ game }: { game: ScoredGame }) {
  const writer = useGameWriter();
  const on = game.status === 'Jogando';
  return (
    <button
      type="button"
      className={cn('icon-button min-h-11 min-w-11', on && 'bg-accent text-accent-foreground')}
      aria-pressed={on}
      aria-label={on ? 'Pausar ' + game.name : 'Começar a jogar ' + game.name}
      title={on ? 'Pausar e devolver à fila' : 'Começar a jogar: registrar início hoje'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void writer.togglePlaying(game);
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[23px]">
        <path
          d="M7 7h10c2 0 3.4 1.5 3.8 3.5l1 6c.4 2.5-2 3.8-3.7 2.2L15.5 16h-7l-2.6 2.7c-1.7 1.6-4.1.3-3.7-2.2l1-6C3.6 8.5 5 7 7 7Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M7 10v5m-2.5-2.5h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="16" cy="11" r="1" fill="currentColor" />
        <circle cx="18" cy="14" r="1" fill="currentColor" />
      </svg>
    </button>
  );
}
