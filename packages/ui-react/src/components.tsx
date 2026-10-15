import { useEffect, useId, useRef, type ReactNode } from 'react';

/** Neutral placeholder for "nothing here". */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center" role="status">
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
  retryLabel = 'Tentar de novo',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="px-4 py-8 text-center text-destructive" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Previous/next paging with a live position label. Renders nothing for a single page. */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  labels = { previous: 'Anterior', next: 'Próxima', position: (p, c) => `Página ${p} de ${c}` },
}: {
  page: number;
  pageCount: number | undefined;
  onPageChange(page: number): void;
  labels?: { previous: string; next: string; position(page: number, pageCount: number): string };
}) {
  if (pageCount === undefined || pageCount <= 1) return null;
  return (
    <nav className="flex items-center justify-center gap-3 py-4" aria-label="Paginação">
      <button
        type="button"
        className="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {labels.previous}
      </button>
      <span aria-live="polite">{labels.position(page, pageCount)}</span>
      <button
        type="button"
        className="button"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        {labels.next}
      </button>
    </nav>
  );
}

/** Modal confirmation on the native <dialog> (focus trap and Escape come from the platform; a backdrop click cancels). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
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
  return (
    <dialog
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      ref={ref}
      className="m-auto max-w-[420px] rounded-lg border border-border bg-card p-6 text-foreground backdrop:bg-scrim"
      aria-labelledby={titleId}
      onCancel={(e) => (e.preventDefault(), onCancel())}
    >
      <h2 id={titleId}>{title}</h2>
      {description && <p>{description}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="button" onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={destructive ? 'button danger' : 'button primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}

/** Renders children only when `can(permission)` holds. The check is a UX hint; the server enforces access. */
export function PermissionGate<P extends string = string>({
  can,
  permission,
  fallback = null,
  children,
}: {
  can(permission: P): boolean;
  permission: P;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return <>{can(permission) ? children : fallback}</>;
}
