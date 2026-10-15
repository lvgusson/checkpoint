import { memo, useCallback, useState } from 'react';
import { Link } from 'react-router';
import type { Desire, ScoredGame } from '../../../../../packages/core/src/models';
import { ImmediateButton } from '../immediate';
import { badgeColor } from '../metadata';
import { PlayingButton } from '../playing';

export interface GameCardProps {
  game: ScoredGame;
  onDesire(id: string, desire: Desire): void;
  onError(message: string): void;
}

export const GameCard = memo(function GameCard({ game, onDesire, onError }: GameCardProps) {
  const [coverBroken, setCoverBroken] = useState(false);
  const g = game;

  const handleDesireChanged = useCallback(
    (d: Desire) => {
      onDesire(g.id, d);
    },
    [g.id, onDesire],
  );

  return (
    <article className="game-card">
      <Link
        data-testid={`library-game-${g.id.toLowerCase()}`}
        className="card-link"
        to={`/jogos/${encodeURIComponent(g.id)}`}
      >
        <div className="cover" data-genre={g.primaryGenre}>
          {g.coverUrl && !coverBroken && (
            <img src={g.coverUrl} alt="" loading="lazy" onError={() => setCoverBroken(true)} />
          )}
          <span className="cover-fallback">{g.name.slice(0, 1)}</span>
          <span className={'badge cover-status ' + badgeColor(g.status)}>{g.status}</span>
        </div>
        <div className="card-body">
          <div className="card-store">{g.store || g.platform || 'Minha biblioteca'}</div>
          <h2>{g.name}</h2>
          <div className="tags">
            <span className={'badge ' + badgeColor(g.primaryGenre)}>{g.primaryGenre}</span>
            {g.secondaryTags.slice(0, 2).map((t) => (
              <span key={t} className={'badge ' + badgeColor(t)}>
                {t}
              </span>
            ))}
          </div>
          <div className="card-bottom">
            <span>
              {g.plannedHours === null ? 'Tempo a confirmar' : g.plannedHours + ' h estimadas'}
            </span>
            <span className={'badge ' + badgeColor(g.desire)}>{g.desire}</span>
          </div>
        </div>
      </Link>
      {g.status !== 'Finalizado' && g.status !== 'Desejado' && (
        <>
          <PlayingButton data-testid={`library-playing-${g.id.toLowerCase()}`} game={g} />
          <span className="card-immediate">
            <ImmediateButton
              data-testid={`library-immediate-${g.id.toLowerCase()}`}
              game={g}
              onChanged={handleDesireChanged}
              onFailed={onError}
            />
          </span>
        </>
      )}
    </article>
  );
});
