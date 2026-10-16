import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ComponentCatalogId, getAllComponents, getComponent } from './registry';
import { Cover } from './Cover';

const html = (node: React.ReactNode) => renderToString(node as React.ReactElement);

describe('Component Registry', () => {
  it('contains all 15 catalog items matching ComponentCatalogId enum', () => {
    const all = getAllComponents();
    const expectedIds = Object.values(ComponentCatalogId);

    expect(all.length).toBe(expectedIds.length);
    for (const id of expectedIds) {
      const comp = getComponent(id);
      expect(comp).toBeDefined();
      expect(comp?.id).toBe(id);
      expect(comp?.name).toBeTruthy();
      expect(comp?.description).toBeTruthy();
      expect(comp?.category).toBeTruthy();
      expect(Array.isArray(comp?.propDefinitions)).toBe(true);
      expect(comp?.defaultProps).toBeDefined();
      expect(typeof comp?.render).toBe('function');
    }
  });

  it('returns undefined for unknown component ID', () => {
    expect(getComponent('unknown-component-id')).toBeUndefined();
  });

  it('renders every registered component with defaultProps without throwing', () => {
    const all = getAllComponents();
    for (const comp of all) {
      expect(() => {
        const node = comp.render(comp.defaultProps);
        const out = html(node);
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
      }).not.toThrow();
    }
  });

  describe('prop updates reflect in rendered output', () => {
    it('updates Button when text, variant and disabled props change', () => {
      const comp = getComponent(ComponentCatalogId.Button)!;
      const initial = html(comp.render({ ...comp.defaultProps, children: 'Confirmar Ação' }));
      expect(initial).toContain('Confirmar Ação');

      const updated = html(
        comp.render({ ...comp.defaultProps, children: 'Excluir Item', disabled: true }),
      );
      expect(updated).toContain('Excluir Item');
      expect(updated).toContain('disabled');
    });

    it('updates Input when placeholder and type change', () => {
      const comp = getComponent(ComponentCatalogId.Input)!;
      const out = html(
        comp.render({
          ...comp.defaultProps,
          placeholder: 'Pesquise por franquia…',
          type: 'search',
        }),
      );
      expect(out).toContain('placeholder="Pesquise por franquia…"');
      expect(out).toContain('type="search"');
    });

    it('updates MetadataBadge when kind and value change', () => {
      const comp = getComponent(ComponentCatalogId.MetadataBadge)!;
      const out = html(comp.render({ kind: 'genre', value: 'Metroidvania' }));
      expect(out).toContain('Metroidvania');
      expect(out).toContain('metadata-badge');
    });

    it('updates EmptyState when title and description change', () => {
      const comp = getComponent(ComponentCatalogId.EmptyState)!;
      const out = html(
        comp.render({
          title: 'Nenhum resultado para este filtro',
          description: 'Ajuste os parâmetros da pesquisa.',
          showAction: false,
        }),
      );
      expect(out).toContain('Nenhum resultado para este filtro');
      expect(out).toContain('Ajuste os parâmetros da pesquisa.');
    });

    it('updates ErrorState when message changes', () => {
      const comp = getComponent(ComponentCatalogId.ErrorState)!;
      const out = html(
        comp.render({
          message: 'Falha crítica de conexão',
          retryLabel: 'Recarregar',
          hasRetry: true,
        }),
      );
      expect(out).toContain('Falha crítica de conexão');
      expect(out).toContain('Recarregar');
    });

    it('updates Bonfire when mono prop changes', () => {
      const comp = getComponent(ComponentCatalogId.Bonfire)!;
      const color = html(comp.render({ mono: false }));
      expect(color).toContain('class="bonfire"');

      const mono = html(comp.render({ mono: true }));
      expect(mono).toContain('class="bonfire mono"');
    });

    it('updates AppLoader label and variant', () => {
      const comp = getComponent(ComponentCatalogId.AppLoader)!;
      const out = html(
        comp.render({
          label: 'Aguarde carregando jogos…',
          variant: 'spinner',
          layout: 'inline',
          size: 'sm',
        }),
      );
      expect(out).toContain('Aguarde carregando jogos…');
      expect(out).toContain('ckl__spinner');
    });

    it('renders Cover component with game initials fallback or artwork', () => {
      const fallback = html(React.createElement(Cover, { name: 'Chrono Trigger', coverUrl: null }));
      expect(fallback).toContain('data-testid="game-cover"');
      expect(fallback).toContain('C');

      const withImage = html(
        React.createElement(Cover, {
          name: 'Elden Ring',
          coverUrl: 'https://example.com/cover.jpg',
        }),
      );
      expect(withImage).toContain('src="https://example.com/cover.jpg"');
      expect(withImage).toContain('E');
    });
  });
});
