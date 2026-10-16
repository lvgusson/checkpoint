import { CircleDollarSign } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@checkpoint/ui-react';
import type { ScoredGame } from '../../../../../packages/core/src/models';
import { cn } from '@/lib/utils';
import { FinishIcon } from '../finish-dialog';
import { ImmediateButton } from '../immediate';
import { PlayingButton, useGameWriter } from '../playing';

export interface GameActionIconsProps {
  game: ScoredGame;
  onFinish(): void;
  onPurchaseSuccess?(): void;
  onUnpurchaseSuccess?(): void;
  testIdPrefix?: string;
  className?: string;
}

export function GameActionIcons({
  game,
  onFinish,
  onPurchaseSuccess,
  onUnpurchaseSuccess,
  testIdPrefix = 'detail',
  className = '',
}: GameActionIconsProps) {
  const writer = useGameWriter();
  const [confirmAction, setConfirmAction] = useState<'purchase' | 'unpurchase' | null>(null);
  const isPurchased = game.status !== 'Desejado';

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-4 items-center justify-items-center w-full max-w-sm my-3',
          className,
        )}
      >
        <ImmediateButton data-testid={`${testIdPrefix}-immediate`} game={game} />
        <PlayingButton data-testid={`${testIdPrefix}-playing`} game={game} />
        <button
          data-testid={testIdPrefix === 'modal' ? 'modal-finish' : `${testIdPrefix}-finish`}
          type="button"
          className="icon-button finish-btn"
          aria-label={`Finalizar ${game.name}`}
          title="Finalizar: nota, horas e avaliação"
          onClick={onFinish}
        >
          <FinishIcon withFlagDetail />
        </button>
        <button
          data-testid={`${testIdPrefix}-purchase`}
          type="button"
          className={cn(
            'icon-button',
            isPurchased
              ? 'text-emerald-400 hover:text-emerald-300'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-label={
            isPurchased
              ? `Marcar ${game.name} como não comprado`
              : `Marcar ${game.name} como comprado`
          }
          title={
            isPurchased
              ? 'Marcar como não comprado (devolver à lista de desejos)'
              : 'Marcar como comprado'
          }
          onClick={() => setConfirmAction(isPurchased ? 'unpurchase' : 'purchase')}
        >
          <CircleDollarSign className="size-5" />
        </button>
      </div>

      <ConfirmDialog
        data-testid="dialog-purchase"
        open={confirmAction === 'purchase'}
        title="Você comprou o jogo?"
        confirmLabel="Sim"
        cancelLabel="Não"
        onConfirm={async () => {
          setConfirmAction(null);
          try {
            await writer.purchase(game.id);
            onPurchaseSuccess?.();
          } catch {
            // Handled by writer
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        data-testid="dialog-unpurchase"
        open={confirmAction === 'unpurchase'}
        title="Deseja marcar o jogo como não comprado?"
        confirmLabel="Sim"
        cancelLabel="Não"
        onConfirm={async () => {
          setConfirmAction(null);
          try {
            await writer.unpurchase(game.id);
            onUnpurchaseSuccess?.();
          } catch {
            // Handled by writer
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
