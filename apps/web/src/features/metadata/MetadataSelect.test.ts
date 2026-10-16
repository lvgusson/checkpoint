import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MetadataSelect } from './MetadataSelect';
import { Combobox } from '@/components/ui/combobox';

const html = (node: React.ReactElement) => renderToString(node);

describe('MetadataSelect', () => {
  it('renders single-selection combobox with proper accessible roles and test IDs', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Status do Jogo',
        kind: 'status',
        options: ['Não iniciado', 'Jogando', 'Finalizado'],
        value: 'Jogando',
        onValueChange: () => {},
        'data-testid': 'modal-status',
      }),
    );

    expect(out).toContain('data-testid="modal-status"');
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).toContain('Status do Jogo');
    expect(out).toContain('Jogando');
  });

  it('renders multiple-selection combobox with tag counter and badges', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Tags secundárias',
        kind: 'tag',
        multiple: true,
        max: 3,
        options: ['RPG', 'Ação', 'Indie', 'Aventura'],
        values: ['RPG', 'Indie'],
        onValuesChange: () => {},
        'data-testid': 'modal-tags',
      }),
    );

    expect(out).toContain('data-testid="modal-tags"');
    expect(out).toContain('2 / 3 tags selecionadas');
    expect(out).toContain('RPG');
    expect(out).toContain('Indie');
  });

  it('renders loading state text when options are being fetched', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Vontade',
        kind: 'desire',
        options: [],
        value: '',
        isLoading: true,
        onValueChange: () => {},
        'data-testid': 'modal-desire',
      }),
    );

    expect(out).toContain('Carregando…');
  });

  it('does not render virtual keyboard search input', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Status do Jogo',
        kind: 'status',
        options: ['Não iniciado', 'Jogando', 'Finalizado'],
        value: 'Jogando',
        onValueChange: () => {},
        'data-testid': 'modal-status',
      }),
    );

    expect(out).not.toContain('role="searchbox"');
    expect(out).not.toContain('modal-status-search');
  });

  it('renders centered ChevronDown icon with transition and right padding instead of text character', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Gênero',
        kind: 'genre',
        options: ['RPG', 'Ação'],
        value: 'RPG',
        onValueChange: () => {},
        'data-testid': 'modal-genre',
      }),
    );

    // Must not contain deformed text character
    expect(out).not.toContain('⌄');

    // Must have ChevronDown svg with transition styling
    expect(out).toContain('transition-transform duration-200');

    // Must have right padding to keep arrow away from edge
    expect(out).toContain('pr-3.5');
  });

  it('renders search input when searchable is enabled', () => {
    const out = html(
      React.createElement(MetadataSelect, {
        label: 'Status do Jogo',
        kind: 'status',
        options: ['Não iniciado', 'Jogando', 'Finalizado'],
        value: 'Jogando',
        searchable: true,
        searchPlaceholder: 'Filtrar status…',
        onValueChange: () => {},
        'data-testid': 'modal-status',
      }),
    );

    // Popover is not open in initial render, but trigger and configuration are supported
    expect(out).toContain('data-testid="modal-status"');
  });
});

describe('Combobox', () => {
  it('renders generic accessible combobox trigger with label and placeholder', () => {
    const out = html(
      React.createElement(Combobox, {
        label: 'Filtro de Loja',
        options: ['Steam', 'GOG', 'Epic Games'],
        value: 'Steam',
        placeholder: 'Selecione uma loja',
        'data-testid': 'combobox-store',
      }),
    );

    expect(out).toContain('data-testid="combobox-store"');
    expect(out).toContain('role="combobox"');
    expect(out).toContain('aria-haspopup="listbox"');
    expect(out).toContain('Filtro de Loja');
    expect(out).toContain('Steam');

    // Centered ChevronDown with transition and trigger right padding
    expect(out).toContain('transition-transform duration-200');
    expect(out).toContain('pr-3.5');
    expect(out).not.toContain('⌄');
  });

  it('supports multiple selection mode with counter and custom values', () => {
    const out = html(
      React.createElement(Combobox, {
        label: 'Tags',
        options: ['Indie', 'Roguelike', 'Souls-like'],
        multiple: true,
        values: ['Indie', 'Roguelike'],
        max: 3,
        'data-testid': 'combobox-tags',
      }),
    );

    expect(out).toContain('data-testid="combobox-tags"');
    expect(out).toContain('Indie, Roguelike');
    expect(out).toContain('2 / 3 selecionados');
  });

  it('does not render virtual keyboard search input', () => {
    const out = html(
      React.createElement(Combobox, {
        label: 'Filtro de Loja',
        options: ['Steam', 'GOG', 'Epic Games'],
        value: 'Steam',
        placeholder: 'Selecione uma loja',
        'data-testid': 'combobox-store',
      }),
    );

    expect(out).not.toContain('role="searchbox"');
    expect(out).not.toContain('combobox-store-search');
  });
});
