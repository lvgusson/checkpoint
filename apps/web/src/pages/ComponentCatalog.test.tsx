import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ComponentCatalogPage } from './ComponentCatalogPage';
import { ComponentDetailPage } from './ComponentDetailPage';

vi.mock('react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) =>
    React.createElement('a', { href: to, ...props }, children),
  useParams: () => ({ name: 'button' }),
}));

const html = (node: React.ReactNode) => renderToString(node as React.ReactElement);

describe('ComponentCatalogPage and ComponentDetailPage', () => {
  it('renders ComponentCatalogPage with header, search input and category pills', () => {
    const out = html(<ComponentCatalogPage />);

    expect(out).toContain('data-testid="component-catalog-page"');
    expect(out).toContain('Biblioteca de Componentes');
    expect(out).toContain('data-testid="component-search-input"');
    expect(out).toContain('data-testid="catalog-filter-all"');
    expect(out).toContain('data-testid="catalog-filter-primitives"');
    expect(out).toContain('data-testid="catalog-filter-feedback"');
    expect(out).toContain('data-testid="catalog-filter-actions"');
    expect(out).toContain('data-testid="catalog-filter-metadata"');
    expect(out).toContain('data-testid="catalog-filter-dialogs"');
    expect(out).toContain('data-testid="catalog-card-button"');
    expect(out).toContain('data-testid="catalog-card-app-loader"');
  });

  it('renders ComponentDetailPage with interactive viewport and prop controls panel', () => {
    const out = html(<ComponentDetailPage />);

    expect(out).toContain('data-testid="component-detail-page"');
    expect(out).toContain('data-testid="back-to-catalog"');
    expect(out).toContain('← Voltar para todos os componentes');
    expect(out).toContain('data-testid="component-viewport"');
    expect(out).toContain('data-testid="component-props-panel"');
    expect(out).toContain('data-testid="reset-props-button"');
    expect(out).toContain('data-testid="prop-control-children"');
    expect(out).toContain('data-testid="prop-control-variant"');
  });
});
