import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { GameDetailTags } from './GameDetailTags';

const html = (node: React.ReactElement) => renderToString(node);

describe('GameDetailTags', () => {
  it('renders all badges on desktop and collapses tags with +X pill on mobile when > 3 tags', () => {
    const game = {
      status: 'Jogando' as const,
      primaryGenre: 'RPG',
      secondaryTags: ['Viagem no Tempo', 'Clássico'],
      pace: 'Moderado',
      structure: 'Linear',
      coop: 'Não',
    };

    const out = html(React.createElement(GameDetailTags, { game, testIdPrefix: 'test' }));

    // Desktop view shows all tags
    expect(out).toContain('data-testid="test-tags"');
    expect(out).toContain('RPG');
    expect(out).toContain('Viagem no Tempo');
    expect(out).toContain('Clássico');
    expect(out).toContain('Moderado');
    expect(out).toContain('Linear');
    expect(out).toContain('Não');

    // Mobile view shows first 3 tags and overflow pill
    expect(out).toContain('data-testid="test-tags-mobile"');
    expect(out).toContain('data-testid="test-tags-overflow"');
    // Total tags = 7 (status, genre, 2 secondary, pace, structure, coop) -> overflow = 7 - 3 = 4
    expect(out).toContain('+4');
  });

  it('does not render overflow pill when tags count is 3 or less', () => {
    const game = {
      status: 'Não iniciado' as const,
      primaryGenre: 'Ação',
      secondaryTags: ['Indie'],
      pace: '',
      structure: '',
      coop: '',
    };

    const out = html(React.createElement(GameDetailTags, { game, testIdPrefix: 'test' }));

    expect(out).not.toContain('data-testid="test-tags-overflow"');
    expect(out).toContain('Ação');
    expect(out).toContain('Indie');
  });
});
