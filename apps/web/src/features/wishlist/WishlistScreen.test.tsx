import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { WishlistScreen } from './WishlistScreen';
import type { WishlistItem } from '../../../../../packages/core/src/models';

vi.mock('react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', props, children),
}));

vi.mock('../details', () => ({
  GameDetailModal: () => null,
}));

const mockItems: WishlistItem[] = [
  {
    game: {
      id: 'zelda-botw',
      name: 'The Legend of Zelda: Breath of the Wild',
      primaryGenre: 'Aventura',
      secondaryTags: ['Mundo Aberto', 'Exploração'],
      status: 'Desejado',
      desire: 'Muito Alta',
      store: 'Nintendo eShop',
      platform: 'Switch',
      pace: 'Moderado',
      structure: 'Mundo Aberto',
      coop: 'Não',
      actualHours: null,
      startedAt: null,
      finishedAt: null,
      rating: null,
      notes: '',
      mainHours: 50,
      extraHours: 100,
      completionistHours: 190,
      size: 'Grande',
      timeVerification: '',
      timeSource: '',
      reviewNotes: '',
      previousEstimatedHours: null,
      mechanic: 'Física',
      prerequisiteId: null,
      steamAppId: null,
      steamHours: null,
      steamUpdatedAt: null,
      updatedAt: null,
      coverUrl: null,
      imported: {
        plannedHours: 50,
        affinity: 90,
        baseScore: 92,
        queueScore: null,
        previousPendingId: null,
      },
      plannedHours: 50,
      affinity: 90,
      baseScore: 92,
      score: 95,
    },
    price: null,
    description: 'Aventura lendária em Hyrule',
  },
  {
    game: {
      id: 'hollow-knight',
      name: 'Hollow Knight',
      primaryGenre: 'Metroidvania',
      secondaryTags: ['Souls-like', '2D'],
      status: 'Desejado',
      desire: 'Alta',
      store: 'Steam',
      platform: 'PC',
      pace: 'Frenético',
      structure: 'Não-linear',
      coop: 'Não',
      actualHours: null,
      startedAt: null,
      finishedAt: null,
      rating: null,
      notes: '',
      mainHours: 25,
      extraHours: 40,
      completionistHours: 60,
      size: 'Médio',
      timeVerification: '',
      timeSource: '',
      reviewNotes: '',
      previousEstimatedHours: null,
      mechanic: 'Plataforma',
      prerequisiteId: null,
      steamAppId: 367520,
      steamHours: null,
      steamUpdatedAt: null,
      updatedAt: null,
      coverUrl: null,
      imported: {
        plannedHours: 25,
        affinity: 85,
        baseScore: 88,
        queueScore: null,
        previousPendingId: null,
      },
      plannedHours: 25,
      affinity: 85,
      baseScore: 88,
      // no score property, should fallback to baseScore
    },
    price: null,
    description: 'Explore o reino em ruínas de Hallownest',
  },
];

vi.mock('./wishlist', () => ({
  formatPrice: () => 'R$ 0,00',
  useWishlist: () => ({
    wishlist: {
      data: mockItems,
      isLoading: false,
      isFetching: false,
      error: null,
    },
    genres: ['Aventura', 'Metroidvania', 'RPG'],
  }),
  useWishlistActions: () => ({
    add: { isPending: false },
    purchase: { isPending: false },
    importSteam: { isPending: false },
    refreshPrices: { isPending: false },
  }),
  useSteamSearch: () => ({
    results: [],
    searching: false,
    error: null,
  }),
}));

describe('WishlistScreen default sort and PC score', () => {
  it('defaults to recommendation sort in the select dropdown', () => {
    const html = renderToString(React.createElement(WishlistScreen));

    // The recommendation option should be selected by default
    expect(html).toContain('value="recommendation" selected=""');
  });

  it('renders recommendation score inside card-bottom on mobile and desktop', () => {
    const html = renderToString(React.createElement(WishlistScreen));

    // Zelda has score 95
    expect(html).toContain('Pontuação: 95');
    // Hollow Knight falls back to baseScore 88
    expect(html).toContain('Pontuação: 88');
    // Check score element class (non-mono, visible on both mobile and desktop)
    expect(html).toContain('class="score text-sm font-semibold text-foreground"');
    expect(html).not.toContain('hidden sm:inline-flex score');
  });
});
