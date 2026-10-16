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

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    if (queryKey[0] === 'catalog') {
      return { data: mockCatalog, isLoading: false, isError: false };
    }
    return { data: mockGame, isLoading: false, isError: false };
  },
}));

import { MemoryRouter } from 'react-router';
const html = (node: React.ReactElement) =>
  renderToString(React.createElement(MemoryRouter, null, node));

describe('GameDetailModal', () => {
  it('renders modal with object-contain cover art and tag combobox control', () => {
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

    // Comboboxes for status, desire and tags must be present
    expect(out).toContain('data-testid="modal-status"');
    expect(out).toContain('data-testid="modal-desire"');
    expect(out).toContain('data-testid="modal-tags"');

    // Tags control must display selected tags count and tags
    expect(out).toContain('2 / 3 tags selecionadas');
    expect(out).toContain('Viagem no Tempo');
    expect(out).toContain('Clássico');
  });
});
