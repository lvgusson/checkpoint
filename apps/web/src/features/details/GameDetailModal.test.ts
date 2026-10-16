import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GameDetailModal } from './GameDetailModal';

vi.mock('../../query/keys', () => ({
  useQueryKeys: () => ({
    game: (id: string) => ['game', id],
    catalog: () => ['catalog'],
  }),
}));

vi.mock('../playing/gameWriter', () => ({
  useGameWriter: () => ({
    save: vi.fn(),
  }),
}));

const mockGame = {
  id: 'game-1',
  name: 'Chrono Trigger',
  primaryGenre: 'RPG',
  secondaryTags: ['Viagem no Tempo', 'Clássico'],
  status: 'Jogando',
  desire: 'Alta',
  store: 'Steam',
  platform: 'PC',
  pace: 'Moderado',
  structure: 'Linear',
  coop: 'Não',
  actualHours: 15,
  startedAt: '2025-01-01',
  finishedAt: null,
  rating: null,
  notes: 'Excelente RPG',
  baseScore: 95,
  affinity: 90,
  plannedHours: 25,
  steamHours: 12,
  steamAppId: 613830,
  coverUrl: 'https://cdn.example.com/chrono.jpg',
};

const mockCatalog = {
  genres: ['RPG', 'Ação'],
  tags: ['Viagem no Tempo', 'Clássico', 'Pixel Art'],
  statuses: ['Não iniciado', 'Jogando', 'Finalizado'],
  desires: ['Muito Alta', 'Alta', 'Média'],
};

let mockCatalogState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: mockCatalog,
  isLoading: false,
  isError: false,
};
let mockGameState: { data: unknown; isLoading: boolean; isError: boolean } = {
  data: mockGame,
  isLoading: false,
  isError: false,
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'catalog') {
      return mockCatalogState;
    }
    return mockGameState;
  },
}));

import { MemoryRouter } from 'react-router';
import { MODAL_QUERY_TIMEOUT_MS } from './GameDetailModal';

const html = (node: React.ReactElement) =>
  renderToString(React.createElement(MemoryRouter, null, node));

describe('GameDetailModal', () => {
  it('renders modal with object-contain cover art and tag combobox control', () => {
    mockCatalogState = { data: mockCatalog, isLoading: false, isError: false };
    mockGameState = { data: mockGame, isLoading: false, isError: false };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    // Cover art must use object-contain to preserve full rectangle
    expect(out).toContain('object-contain');
    expect(out).not.toContain('object-cover');

    // Comboboxes for status, desire, genre and tags must be present
    expect(out).toContain('data-testid="modal-status"');
    expect(out).toContain('data-testid="modal-desire"');
    expect(out).toContain('data-testid="modal-genre"');
    expect(out).toContain('data-testid="modal-tags"');

    // Tags control must display selected tags count and tags
    expect(out).toContain('2 / 3 tags selecionadas');
    expect(out).toContain('Viagem no Tempo');
    expect(out).toContain('Clássico');
  });

  it('renders accessible catalog error alert and disables metadata controls when catalog fails', () => {
    mockCatalogState = { data: undefined, isLoading: false, isError: true };
    mockGameState = { data: mockGame, isLoading: false, isError: false };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    expect(out).toContain('data-testid="modal-catalog-error"');
    expect(out).toContain('role="alert"');
    expect(out).toContain('Não foi possível carregar as opções de catálogo.');
    expect(out).toContain('data-testid="modal-catalog-retry"');
    expect(out).toContain('Tentar novamente');

    // Controls must be disabled
    expect(out).toMatch(/data-testid="modal-status"[^>]*disabled/);
    expect(out).toMatch(/data-testid="modal-desire"[^>]*disabled/);
    expect(out).toMatch(/data-testid="modal-genre"[^>]*disabled/);
    expect(out).toMatch(/data-testid="modal-tags"[^>]*disabled/);
  });

  it('renders catalog loading state and disables controls while catalog is in flight', () => {
    mockCatalogState = { data: undefined, isLoading: true, isError: false };
    mockGameState = { data: mockGame, isLoading: false, isError: false };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    expect(out).toContain('data-testid="modal-catalog-loading"');
    expect(out).toContain('role="status"');
    expect(out).toContain('Carregando opções de catálogo…');
    expect(out).toMatch(/data-testid="modal-status"[^>]*disabled/);
    expect(out).toMatch(/data-testid="modal-genre"[^>]*disabled/);
  });

  it('renders 4 action icons and renders metadata tags as badges with mobile overflow', () => {
    mockCatalogState = { data: mockCatalog, isLoading: false, isError: false };
    mockGameState = { data: mockGame, isLoading: false, isError: false };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    // 4 action buttons evenly spaced
    expect(out).toContain('data-testid="modal-immediate"');
    expect(out).toContain('data-testid="modal-playing"');
    expect(out).toContain('data-testid="modal-finish"');
    expect(out).toContain('data-testid="modal-purchase"');

    // Tags instead of plain words: pace, structure, coop as badges
    expect(out).not.toContain('Moderado · Linear · Não');
    expect(out).toContain('data-testid="modal-tags"');
    expect(out).toContain('Moderado');
    expect(out).toContain('Linear');
    expect(out).toContain('Não');

    // Overflow pill on mobile when total tags > 3
    expect(out).toContain('data-testid="modal-tags-overflow"');
  });

  it('renders modal game loader when game query is in flight', () => {
    mockCatalogState = { data: mockCatalog, isLoading: false, isError: false };
    mockGameState = { data: undefined, isLoading: true, isError: false };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    expect(out).toContain('data-testid="loader-modal"');
    expect(out).toContain('role="status"');
  });

  it('renders error state and retry button when game query fails', () => {
    mockCatalogState = { data: mockCatalog, isLoading: false, isError: false };
    mockGameState = { data: undefined, isLoading: false, isError: true };

    const out = html(
      React.createElement(GameDetailModal, {
        gameId: 'game-1',
        open: true,
        onOpenChange: () => {},
      }),
    );

    expect(out).toContain('role="alert"');
    expect(out).toContain('Não foi possível carregar o jogo.');
    expect(out).toContain('data-testid="modal-game-retry"');
    expect(out).not.toContain('data-testid="loader-modal"');
  });

  it('bounds modal query timeout to <= 25 seconds', () => {
    expect(MODAL_QUERY_TIMEOUT_MS).toBeLessThanOrEqual(25_000);
    expect(MODAL_QUERY_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
