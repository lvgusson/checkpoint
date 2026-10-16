import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QueueRow, PlayingRow } from './QueueView';
import type { QueueEntry } from '../../../../../packages/core/src/models';

vi.mock('react-router', () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement('a', props, children),
}));

vi.mock('../playing', () => ({
  PlayingButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }),
}));

vi.mock('../immediate', () => ({
  ImmediateButton: ({ 'data-testid': testId }: { 'data-testid': string }) =>
    React.createElement('button', { 'data-testid': testId }),
}));

const mockEntry: QueueEntry = {
  position: 1,
  score: 87.4,
  cumulativeHours: 12,
  reasons: ['Recomendado'],
  adjustments: [],
  pinnedPosition: null,
  pinnedBeforePrerequisite: false,
  game: {
    id: 'mario-odyssey',
    name: 'Super Mario Odyssey',
    primaryGenre: 'Plataforma 3D',
    secondaryTags: ['Coletatona', 'Aventura'],
    status: 'Não iniciado',
    desire: 'Alta',
    store: 'eShop',
    platform: 'Switch',
    pace: 'Moderado',
    structure: 'Mundo Aberto',
    coop: 'Coop Local',
    actualHours: null,
    startedAt: null,
    finishedAt: null,
    rating: null,
    notes: '',
    mainHours: 12,
    extraHours: 25,
    completionistHours: 60,
    size: 'Médio',
    timeVerification: '',
    timeSource: '',
    reviewNotes: '',
    previousEstimatedHours: null,
    mechanic: 'Pulo',
    prerequisiteId: null,
    steamAppId: null,
    steamHours: null,
    steamUpdatedAt: null,
    updatedAt: null,
    coverUrl: null,
    imported: {
      plannedHours: 12,
      affinity: 85,
      baseScore: 85,
      queueScore: 87,
      previousPendingId: null,
    },
    plannedHours: 12,
    affinity: 85,
    baseScore: 85,
  },
};

describe('QueueRow mobile score and tags popover', () => {
  it('renders mobile score right below game name', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('Pontuação: 87');
    expect(html).toContain('sm:hidden text-xs text-muted-foreground font-medium');
  });

  it('renders mobile tags container with trimmed primary tag and popover button', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain(
      'queue-mobile-tags flex items-center gap-1 min-w-0 mr-auto sm:hidden pl-2',
    );
    expect(html).toContain('truncate max-w-[90px] whitespace-nowrap');
    expect(html).toContain('Plataforma 3D');
    expect(html).toContain('data-testid="queue-tags-popover-mario-odyssey"');
    expect(html).toContain('+2');
  });

  it('falls back to first secondary tag when primaryGenre is empty', () => {
    const entryWithoutGenre: QueueEntry = {
      ...mockEntry,
      game: {
        ...mockEntry.game,
        id: 'indie-game',
        primaryGenre: '',
        secondaryTags: ['Roguelike', 'Pixel Art'],
      },
    };

    const html = renderToString(
      React.createElement(QueueRow, {
        entry: entryWithoutGenre,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('Roguelike');
    expect(html).toContain('truncate max-w-[90px] whitespace-nowrap');
    expect(html).toContain('data-testid="queue-tags-popover-indie-game"');
    expect(html).toContain('+1');
  });

  it('does not render overflow popover button when otherTags is empty', () => {
    const entryNoOtherTags: QueueEntry = {
      ...mockEntry,
      game: {
        ...mockEntry.game,
        id: 'single-tag-game',
        primaryGenre: 'Ação',
        secondaryTags: [],
      },
    };

    const html = renderToString(
      React.createElement(QueueRow, {
        entry: entryNoOtherTags,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).not.toContain('queue-tags-popover-single-tag-game');
  });

  it('renders all 4 action icons grouped on the right', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('data-testid="queue-immediate-mario-odyssey"');
    expect(html).toContain('data-testid="queue-playing-mario-odyssey"');
    expect(html).toContain('data-testid="queue-finish-mario-odyssey"');
    expect(html).toContain('data-testid="queue-unpurchase-mario-odyssey"');
  });

  it('renders money button as queue-purchase when game is on wishlist', () => {
    const wishlistEntry: QueueEntry = {
      ...mockEntry,
      game: {
        ...mockEntry.game,
        id: 'wishlist-game',
        status: 'Desejado',
      },
    };

    const html = renderToString(
      React.createElement(QueueRow, {
        entry: wishlistEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('data-testid="queue-purchase-wishlist-game"');
  });

  it('renders desktop grip handle and select-none classes on queue row and link', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('data-testid="queue-drag-handle-mario-odyssey"');
    expect(html).toContain('hidden sm:inline-flex items-center justify-center p-1 mr-1');
    expect(html).toContain('queue-row select-none');
    expect(html).toContain('queue-link select-none');
  });

  it('does not render desktop grip handle when searching', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: true,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).not.toContain('queue-drag-handle-mario-odyssey');
  });

  it('renders dedicated unpin button when item is pinned', () => {
    const pinnedEntry: QueueEntry = {
      ...mockEntry,
      pinnedPosition: 3,
    };

    const html = renderToString(
      React.createElement(QueueRow, {
        entry: pinnedEntry,
        index: 2,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).toContain('data-testid="queue-unpin-mario-odyssey"');
    expect(html).toContain('Desafixar Super Mario Odyssey');
    expect(html).toContain('text-amber-400');
  });

  it('does not render dedicated unpin button when item is not pinned', () => {
    const html = renderToString(
      React.createElement(QueueRow, {
        entry: mockEntry,
        index: 0,
        searching: false,
        busy: false,
        anyBusy: false,
        flash: false,
        isDragging: false,
        pointerProps: {},
        handleProps: {},
        onResetManual: () => {},
        onFinish: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
      }),
    );

    expect(html).not.toContain('queue-unpin-mario-odyssey');
  });
});

describe('PlayingRow mobile tags collapse and select-none', () => {
  const playingGame = {
    ...mockEntry.game,
    status: 'Jogando' as const,
    startedAt: '2026-03-01T10:00:00.000Z',
  };

  it('renders playing-row with select-none, desktop tags and mobile collapsed popover', () => {
    const html = renderToString(
      React.createElement(PlayingRow, {
        game: playingGame,
        onOpenDetails: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
        onFinish: () => {},
      }),
    );

    expect(html).toContain('playing-row select-none');
    expect(html).toContain('tags hidden sm:flex');
    expect(html).toContain('sm:hidden flex items-center gap-1 min-w-0');
    expect(html).toContain('data-testid="queue-playing-tags-popover-mario-odyssey"');
    expect(html).toContain('+4');
  });

  it('does not render playing tags popover when no other tags exist', () => {
    const singleTagGame = {
      ...playingGame,
      id: 'simple-game',
      status: '' as unknown as 'Jogando',
      desire: '' as unknown as 'Alta',
      secondaryTags: [],
    };

    const html = renderToString(
      React.createElement(PlayingRow, {
        game: singleTagGame,
        onOpenDetails: () => {},
        onSetDesire: () => {},
        onDesireSaved: () => {},
        onDesireFailed: () => {},
        onFinish: () => {},
      }),
    );

    expect(html).not.toContain('queue-playing-tags-popover-simple-game');
  });
});
