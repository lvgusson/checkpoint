import { CircleDollarSign } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { Link } from 'react-router';
import type { Desire, ScoredGame } from '../../../../../packages/core/src/models';
import { cn } from '@/lib/utils';
import { FinishIcon } from '../finish-dialog';
import { ImmediateButton } from '../immediate';
import { badgeColor } from '../metadata';
import { PlayingButton } from '../playing';

export interface GameCardProps {
  game: ScoredGame;
  onDesire(id: string, desire: Desire): void;
  onError(message: string): void;
  onPurchase?(game: ScoredGame): void;
  onUnpurchase?(game: ScoredGame): void;
  onFinish?(game: ScoredGame): void;
}

export const GameCard = memo(function GameCard({
  game,
  onDesire,
  onError,
  onPurchase,
  onUnpurchase,
  onFinish,
}: GameCardProps) {
  const [coverBroken, setCoverBroken] = useState(false);
  const g = game;
  const isPurchased = g.status !== 'Desejado';

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
          {g.coverUrl && !coverBroken ? (
            <img src={g.coverUrl} alt="" loading="lazy" onError={() => setCoverBroken(true)} />
          ) : (
            <span className="cover-fallback">{g.name.slice(0, 1)}</span>
          )}
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
            {g.plannedHours ? <span>{g.plannedHours} h estimadas</span> : null}
            <span className={'badge ' + badgeColor(g.desire)}>{g.desire}</span>
          </div>
        </div>
      </Link>
      <div className="card-actions card-immediate">
        <ImmediateButton
          data-testid={`library-immediate-${g.id.toLowerCase()}`}
          game={g}
          onChanged={handleDesireChanged}
          onFailed={onError}
        />
        <PlayingButton data-testid={`library-playing-${g.id.toLowerCase()}`} game={g} />
        <button
          data-testid={`library-finish-${g.id.toLowerCase()}`}
          type="button"
          className="icon-button finish-btn"
          aria-label={`Finalizar ${g.name}`}
          title="Finalizar: nota, horas e avaliação"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFinish?.(g);
          }}
        >
          <FinishIcon withFlagDetail />
        </button>
        <button
          data-testid={
            isPurchased
              ? `library-unpurchase-${g.id.toLowerCase()}`
              : `library-purchase-${g.id.toLowerCase()}`
          }
          type="button"
          className={cn(
            'icon-button',
            isPurchased
              ? 'text-emerald-400 hover:text-emerald-300'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label={
            isPurchased ? `Marcar ${g.name} como não comprado` : `Marcar ${g.name} como comprado`
          }
          title={
            isPurchased
              ? 'Marcar como não comprado (devolver à lista de desejos)'
              : 'Marcar como comprado'
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isPurchased) {
              onUnpurchase?.(g);
            } else {
              onPurchase?.(g);
            }
          }}
        >
          <CircleDollarSign className="size-5" />
        </button>
      </div>
    </article>
  );
});
