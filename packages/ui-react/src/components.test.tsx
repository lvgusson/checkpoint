import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConfirmDialog } from './components';

const html = (node: React.ReactNode) => renderToString(node);

describe('ConfirmDialog', () => {
  it('places autoFocus on confirm button when not destructive and defaultFocus is not set', () => {
    const out = html(
      <ConfirmDialog
        open={true}
        title="Confirmar ação"
        data-testid="test-dialog"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(out).toMatch(/data-testid="test-dialog-confirm"[^>]*autofocus/i);
    expect(out).not.toMatch(/data-testid="test-dialog-cancel"[^>]*autofocus/i);
  });

  it('places autoFocus on cancel button when destructive and defaultFocus is not set', () => {
    const out = html(
      <ConfirmDialog
        open={true}
        destructive={true}
        title="Excluir item"
        data-testid="test-dialog"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(out).toMatch(/data-testid="test-dialog-cancel"[^>]*autofocus/i);
    expect(out).not.toMatch(/data-testid="test-dialog-confirm"[^>]*autofocus/i);
  });

  it('respects defaultFocus="confirm" even when destructive is true', () => {
    const out = html(
      <ConfirmDialog
        open={true}
        destructive={true}
        defaultFocus="confirm"
        title="Confirmar"
        data-testid="test-dialog"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(out).toMatch(/data-testid="test-dialog-confirm"[^>]*autofocus/i);
    expect(out).not.toMatch(/data-testid="test-dialog-cancel"[^>]*autofocus/i);
  });

  it('respects defaultFocus="cancel" even when destructive is false', () => {
    const out = html(
      <ConfirmDialog
        open={true}
        defaultFocus="cancel"
        title="Confirmar"
        data-testid="test-dialog"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(out).toMatch(/data-testid="test-dialog-cancel"[^>]*autofocus/i);
    expect(out).not.toMatch(/data-testid="test-dialog-confirm"[^>]*autofocus/i);
  });
});
