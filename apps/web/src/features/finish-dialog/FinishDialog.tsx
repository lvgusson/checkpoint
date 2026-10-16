import { useEffect, useRef, useState } from 'react';
import type { ScoredGame } from '../../../../../packages/core/src/models';
import { isApiError } from '../../api/http';
import { localToday } from '@/lib/utils';
import { AppLoader } from '../loader/AppLoader';
import { useGameWriter } from '../playing/gameWriter';
import './finish-dialog.css';

export type FinishGame = Pick<ScoredGame, 'id' | 'name' | 'actualHours' | 'rating' | 'notes'>;

/** Ratings from 1 to 5 in half-point steps. */
const STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const STARS = [1, 2, 3, 4, 5];
const CLOSE_DRAG_PX = 90;

/**
 * Shared completion dialog with rating, hours, notes and local finish date. Mobile uses a bottom
 * sheet; the native dialog contains focus and handles Escape. Render it only while a game is being
 * finished (`<FinishDialog key={game.id} game={game} onClose={...} />`); `onClose(true)` means saved.
 */
export function FinishDialog({
  game,
  onClose,
}: {
  game: FinishGame;
  onClose(saved: boolean): void;
}) {
  const writer = useGameWriter();
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ id: number; y: number; dy: number } | null>(null);
  const [today] = useState(() => localToday());
  const [rating, setRating] = useState<number | null>(
    STEPS.includes(game.rating ?? 0) ? game.rating : null,
  );
  const [hours, setHours] = useState(game.actualHours === null ? '' : String(game.actualHours));
  const [notes, setNotes] = useState(game.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const parsed =
    hours.trim().replace(',', '.') === '' ? null : Number(hours.trim().replace(',', '.'));
  const hoursInvalid =
    parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000);
  const canSave = !saving && STEPS.includes(rating ?? 0) && !hoursInvalid;
  const todayLabel = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  useEffect(() => {
    const el = dialog.current!;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    el.showModal();
    return () => {
      document.documentElement.style.overflow = overflow;
      if (el.open) el.close();
    };
  }, []);

  const close = (saved: boolean) => onClose(saved);
  const fill = (n: number) =>
    rating !== null && rating >= n ? '100%' : rating !== null && rating >= n - 0.5 ? '50%' : '0%';

  function dragMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    d.dy = Math.max(0, e.clientY - d.y);
    const el = dialog.current!;
    el.style.transition = 'none';
    el.style.transform = `translateY(${d.dy}px)`;
  }
  function dragEnd() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = dialog.current!;
    el.style.transition = 'transform 160ms ease-out';
    if (d.dy > CLOSE_DRAG_PX && !saving) {
      el.style.transform = 'translateY(100%)';
      setTimeout(() => close(false), 160);
    } else el.style.transform = '';
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      await writer.save(game.id, {
        rating,
        actualHours: parsed,
        notes: notes.trim(),
        status: 'Finalizado',
        finishedAt: today,
      });
      close(true);
    } catch (e) {
      setSaving(false);
      setError(
        isApiError(e) && e.status >= 400 && e.status < 500 && e.status !== 408
          ? 'Não foi possível salvar: ' + e.message + '. Corrija e tente de novo.'
          : 'Não foi possível salvar. Verifique a conexão e tente de novo.',
      );
    }
  }

  return (
    <dialog
      data-testid={`dialog-finish-${game.id.toLowerCase()}`}
      ref={dialog}
      className="finish-sheet"
      aria-labelledby="finish-title"
      aria-describedby="finish-date"
      onCancel={(e) => (e.preventDefault(), !saving && close(false))}
      // A click on the dialog element itself (outside the content) is the backdrop.
      onClick={(e) => e.target === dialog.current && !saving && close(false)}
    >
      <form className="finish-body" onSubmit={save} noValidate>
        <div
          data-testid="dialog-finish-drag"
          className="finish-grabber"
          aria-hidden="true"
          onPointerDown={(e) => {
            drag.current = { id: e.pointerId, y: e.clientY, dy: 0 };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={dragMove}
          onPointerUp={dragEnd}
          onPointerCancel={dragEnd}
        />
        <header className="finish-head">
          <span className="eyebrow">FINALIZAR JOGO</span>
          <h2 id="finish-title">{game.name}</h2>
          <p className="muted small" id="finish-date">
            Finalizado em <time dateTime={today}>{todayLabel}</time>
          </p>
        </header>

        <fieldset className="finish-field">
          <legend>
            Nota <span className="finish-value">{rating === null ? '—' : rating + ' / 5'}</span>
          </legend>
          <div className="finish-stars">
            {STARS.map((n) => (
              <span
                key={n}
                className="finish-star"
                style={{ '--fill': fill(n) } as React.CSSProperties}
              >
                ★
                {n === 1 ? (
                  <label className="whole">
                    <input
                      data-testid="dialog-finish-rating-1"
                      type="radio"
                      name="finish-rating"
                      checked={rating === 1}
                      onChange={() => setRating(1)}
                      aria-label="1 estrela"
                    />
                  </label>
                ) : (
                  <>
                    <label className="half left">
                      <input
                        data-testid={`dialog-finish-rating-${String(n - 0.5).replace('.', '-')}`}
                        type="radio"
                        name="finish-rating"
                        checked={rating === n - 0.5}
                        onChange={() => setRating(n - 0.5)}
                        aria-label={n - 0.5 + ' estrelas'}
                      />
                    </label>
                    <label className="half right">
                      <input
                        data-testid={`dialog-finish-rating-${n}`}
                        type="radio"
                        name="finish-rating"
                        checked={rating === n}
                        onChange={() => setRating(n)}
                        aria-label={n + ' estrelas'}
                      />
                    </label>
                  </>
                )}
              </span>
            ))}
          </div>
        </fieldset>

        <label className="finish-field" htmlFor="finish-hours">
          <span>Tempo de jogo (horas)</span>
          <input
            data-testid="dialog-finish-hours"
            id="finish-hours"
            name="actualHours"
            autoComplete="off"
            type="number"
            inputMode="decimal"
            min={0}
            max={100000}
            step={0.5}
            placeholder="Ex.: 32…"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            aria-invalid={hoursInvalid}
          />
          {hoursInvalid && (
            <small className="field-error">
              Informe um número de horas igual ou maior que zero.
            </small>
          )}
        </label>

        <label className="finish-field" htmlFor="finish-notes">
          <span>Avaliação</span>
          <textarea
            data-testid="dialog-finish-notes"
            id="finish-notes"
            name="notes"
            autoComplete="off"
            rows={4}
            maxLength={10000}
            placeholder="O que achou do jogo…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="finish-actions">
          <button
            data-testid="dialog-finish-cancel"
            type="button"
            className="button"
            onClick={() => close(false)}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            data-testid="dialog-finish-save"
            type="submit"
            className="button primary"
            disabled={!canSave}
          >
            {saving ? <AppLoader layout="inline" size="sm" label="Salvando…" /> : 'Finalizar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
