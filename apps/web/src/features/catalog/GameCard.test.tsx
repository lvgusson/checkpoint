import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GameCard } from './GameCard';
import type { ScoredGame } from '../../../../../packages/core/src/models';

vi.mock('react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', props, children),
}));

vi.mock('../playing', () => ({
  PlayingButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }, 'Playing'),
}));

vi.mock('../immediate', () => ({
  ImmediateButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }, 'Immediate'),
}));

const mockPurchasedGame: ScoredGame = {
  id: 'zelda-botw',
  name: 'The Legend of Zelda: Breath of the Wild',
  primaryGenre: 'Aventura',
  secondaryTags: ['Mundo Aberto', 'Exploração'],
  status: 'Não iniciado',
  desire: 'Alta',
  store: 'eShop',
  platform: 'Switch',
  pace: 'Longo',
  structure: 'Mundo Aberto',
  coop: 'Não',
  actualHours: null,
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  baseScore: 97,
  affinity: 95,
  plannedHours: 50,
  steamHours: null,
  steamAppId: null,
  mainHours: 50,
  extraHours: 80,
  completionistHours: 120,
  size: 'Grande',
  timeVerification: '',
  timeSource: '',
  reviewNotes: '',
  previousEstimatedHours: null,
  mechanic: 'Física',
  prerequisiteId: null,
  steamUpdatedAt: null,
  updatedAt: null,
  coverUrl: null,
  imported: {
    plannedHours: 50,
    affinity: 95,
    baseScore: 97,
    queueScore: 98,
    previousPendingId: null,
  },
};

const mockWishlistGame: ScoredGame = {
  ...mockPurchasedGame,
  id: 'elden-ring',
  name: 'Elden Ring',
  status: 'Desejado',
};

const html = (node: React.ReactElement) => renderToString(node);

describe('GameCard action icons', () => {
  it('renders all 4 action icons grouped on the right for purchased game', () => {
    const out = html(
      React.createElement(GameCard, {
        game: mockPurchasedGame,
        onDesire: () => {},
        onError: () => {},
      }),
    );

    expect(out).toContain('data-testid="library-immediate-zelda-botw"');
    expect(out).toContain('data-testid="library-playing-zelda-botw"');
    expect(out).toContain('data-testid="library-finish-zelda-botw"');
    expect(out).toContain('data-testid="library-unpurchase-zelda-botw"');
    expect(out).toContain('text-emerald-400');
  });

  it('renders money button as library-purchase with dimmed style when game is desired', () => {
    const out = html(
      React.createElement(GameCard, {
        game: mockWishlistGame,
        onDesire: () => {},
        onError: () => {},
      }),
    );

    expect(out).toContain('data-testid="library-immediate-elden-ring"');
    expect(out).toContain('data-testid="library-playing-elden-ring"');
    expect(out).toContain('data-testid="library-finish-elden-ring"');
    expect(out).toContain('data-testid="library-purchase-elden-ring"');
    expect(out).toContain('text-muted-foreground');
  });
});

describe('GameCard plannedHours display', () => {
  it('renders estimated hours when plannedHours is positive', () => {
    const out = html(
      React.createElement(GameCard, {
        game: { ...mockPurchasedGame, plannedHours: 50 },
        onDesire: () => {},
        onError: () => {},
      }),
    );
    expect(out).toContain('h estimadas');
    expect(out).toMatch(/50<!-- --> h estimadas/);
  });

  it('does not render estimated hours or confirmation sentence when plannedHours is null', () => {
    const out = html(
      React.createElement(GameCard, {
        game: { ...mockPurchasedGame, plannedHours: null },
        onDesire: () => {},
        onError: () => {},
      }),
    );
    expect(out).not.toContain('estimadas');
    expect(out).not.toContain('Tempo a confirmar');
  });

  it('does not render estimated hours when plannedHours is undefined or 0', () => {
    const outUndefined = html(
      React.createElement(GameCard, {
        game: { ...mockPurchasedGame, plannedHours: undefined as unknown as null },
        onDesire: () => {},
        onError: () => {},
      }),
    );
    expect(outUndefined).not.toContain('estimadas');
    expect(outUndefined).not.toContain('Tempo a confirmar');

    const outZero = html(
      React.createElement(GameCard, {
        game: { ...mockPurchasedGame, plannedHours: 0 },
        onDesire: () => {},
        onError: () => {},
      }),
    );
    expect(outZero).not.toContain('estimadas');
    expect(outZero).not.toContain('Tempo a confirmar');
  });
});
