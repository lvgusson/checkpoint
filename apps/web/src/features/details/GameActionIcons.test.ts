import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GameActionIcons } from './GameActionIcons';

vi.mock('../playing', () => ({
  useGameWriter: () => ({
    purchase: vi.fn(),
    unpurchase: vi.fn(),
    save: vi.fn(),
    togglePlaying: vi.fn(),
    setDesire: vi.fn(),
  }),
  PlayingButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }, 'Playing'),
}));

vi.mock('../immediate', () => ({
  ImmediateButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }, 'Immediate'),
}));

const mockPurchasedGame = {
  id: 'game-1',
  name: 'Chrono Trigger',
  primaryGenre: 'RPG',
  secondaryTags: ['Clássico'],
  status: 'Jogando' as const,
  desire: 'Alta' as const,
  store: 'Steam',
  platform: 'PC',
  pace: 'Moderado',
  structure: 'Linear',
  coop: 'Não',
  actualHours: 15,
  startedAt: '2025-01-01',
  finishedAt: null,
  rating: null,
  notes: '',
  baseScore: 95,
  affinity: 90,
  plannedHours: 25,
  steamHours: 12,
  steamAppId: 613830,
  mainHours: null,
  extraHours: null,
  completionistHours: null,
  size: '',
  timeVerification: '',
  timeSource: '',
  reviewNotes: '',
  previousEstimatedHours: null,
  mechanic: '',
  prerequisiteId: null,
  steamUpdatedAt: null,
  updatedAt: null,
  coverUrl: null,
  imported: {
    plannedHours: null,
    affinity: null,
    baseScore: null,
    queueScore: null,
    previousPendingId: null,
  },
};

const mockWishlistGame = {
  ...mockPurchasedGame,
  id: 'game-wish',
  status: 'Desejado' as const,
};

const html = (node: React.ReactElement) => renderToString(node);

describe('GameActionIcons', () => {
  it('renders 4 action buttons: immediate, playing, finish, and purchase', () => {
    const out = html(
      React.createElement(GameActionIcons, {
        game: mockPurchasedGame,
        onFinish: () => {},
        testIdPrefix: 'test',
      }),
    );

    expect(out).toContain('data-testid="test-immediate"');
    expect(out).toContain('data-testid="test-playing"');
    expect(out).toContain('data-testid="test-finish"');
    expect(out).toContain('data-testid="test-purchase"');
  });

  it('renders money button as active/emerald when game is purchased', () => {
    const out = html(
      React.createElement(GameActionIcons, {
        game: mockPurchasedGame,
        onFinish: () => {},
        testIdPrefix: 'test',
      }),
    );

    expect(out).toContain('text-emerald-400');
    expect(out).toContain('Marcar Chrono Trigger como não comprado');
    expect(out).toContain('Deseja marcar o jogo como não comprado?');
  });

  it('renders money button as dimmed/muted when game is on wishlist', () => {
    const out = html(
      React.createElement(GameActionIcons, {
        game: mockWishlistGame,
        onFinish: () => {},
        testIdPrefix: 'test',
      }),
    );

    expect(out).toContain('text-muted-foreground');
    expect(out).toContain('Marcar Chrono Trigger como comprado');
    expect(out).toContain('Você comprou o jogo?');
  });
});
