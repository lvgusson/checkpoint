import { useState } from 'react';
import type { Desire } from '../../../../../packages/core/src/models';
import { cn } from '@/lib/utils';
import { useGameWriter } from '../playing/gameWriter';
import { Bonfire } from './Bonfire';
import { previousDesire, rememberDesire } from './desireMemory';

/** Toggle immediate desire; emits the optimistic change and restores the original desire after failure. */
export function ImmediateButton({
  game,
  onChanged,
  onFailed,
  onSaved,
}: {
  game: { id: string; name: string; desire: Desire };
  onChanged?(desire: Desire): void;
  onFailed?(message: string): void;
  /** Persisted on the server (the queue may be reloaded now). */
  onSaved?(): void;
}) {
  const writer = useGameWriter();
  const [busy, setBusy] = useState(false);
  const on = game.desire === 'Imediata';

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const next: Desire = on ? previousDesire(game.id) : 'Imediata';
    if (next === 'Imediata') rememberDesire(game.id, game.desire);
    setBusy(true);
    onChanged?.(next);
    try {
      await writer.setDesire(game.id, next);
      onSaved?.();
    } catch {
      onChanged?.(game.desire);
      onFailed?.(`Não foi possível mudar a vontade de ${game.name}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={cn('immediate-btn', on && 'on')}
      aria-pressed={on}
      aria-label={
        on
          ? 'Tirar ' + game.name + ' da vontade imediata'
          : 'Jogar ' + game.name + ' já: vontade imediata, vai para o topo da fila'
      }
      title={on ? 'Voltar à vontade anterior' : 'Vontade imediata: vai para o topo da fila'}
      disabled={busy}
      onClick={toggle}
    >
      <Bonfire mono={!on} />
    </button>
  );
}
