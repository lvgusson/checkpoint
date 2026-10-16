import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Neutral placeholder for "nothing here". */
export function EmptyState({
  title,
  description,
  'data-testid': testId,
  action,
}: {
  'data-testid'?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div data-testid={testId} className="px-4 py-8 text-center" role="status">
      <h2>{title}</h2>
      {description && <p className="text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

/** Failure placeholder; `message` is already user-facing text (no product error types here). */
export function ErrorState({
  message,
  onRetry,
  'data-testid': testId,
  retryLabel = 'Tentar de novo',
}: {
  'data-testid'?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div data-testid={testId} className="px-4 py-8 text-center text-destructive" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button
          data-testid={testId && `${testId}-retry`}
          type="button"
          className="button"
          onClick={onRetry}
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Modal confirmation on the native <dialog> (focus trap and Escape come from the platform; a backdrop click cancels). */
export function ConfirmDialog({
  'data-testid': testId,
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive,
  defaultFocus,
  onConfirm,
  onCancel,
}: {
  'data-testid'?: string;
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  defaultFocus?: 'confirm' | 'cancel';
  onConfirm(): void;
  onCancel(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const focusConfirm = defaultFocus ? defaultFocus === 'confirm' : !destructive;
  return (
    <dialog
      data-testid={testId}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      ref={ref}
      className="m-auto max-w-[420px] rounded-lg border border-border bg-card p-6 text-foreground backdrop:bg-scrim"
      aria-labelledby={titleId}
      onCancel={(e) => (e.preventDefault(), onCancel())}
    >
      <h2 id={titleId}>{title}</h2>
      {description && <p>{description}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          data-testid={testId && `${testId}-cancel`}
          type="button"
          className="button"
          onClick={onCancel}
          autoFocus={!focusConfirm}
        >
          {cancelLabel}
        </button>
        <button
          data-testid={testId && `${testId}-confirm`}
          type="button"
          className={destructive ? 'button danger' : 'button primary'}
          onClick={onConfirm}
          autoFocus={focusConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
