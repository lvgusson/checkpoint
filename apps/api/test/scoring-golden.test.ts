import { describe, expect, it } from 'vitest';
import { Desire, GameStatus, type Game } from '../../../packages/core/src/models.ts';
import { emptyGame } from '../src/integrations/steam/mapping.ts';
import { scoreGames, recommendGames, defaultConfig } from '../src/domain/scoring.ts';

function makeGame(id: string, name: string, overrides: Partial<Game> = {}): Game {
  return {
    ...emptyGame(name),
    id,
    ...overrides,
  };
}

describe('scoring golden tests', () => {
  const sampleGames: Game[] = [
    makeGame('g1', 'Elden Ring', {
      status: GameStatus.Finished,
      rating: 5,
      actualHours: 120,
      mainHours: 60,
      extraHours: 100,
      primaryGenre: 'RPG de ação',
      pace: 'Longo',
      mechanic: 'Soulslike',
      finishedAt: '2026-01-15T10:00:00Z',
    }),
    makeGame('g2', 'Hollow Knight', {
      status: GameStatus.Finished,
      rating: 4,
      actualHours: 40,
      mainHours: 30,
      primaryGenre: 'Metroidvania',
      pace: 'Médio',
      mechanic: 'Plataforma',
      finishedAt: '2026-02-20T10:00:00Z',
    }),
    makeGame('g3', 'Celeste', {
      status: GameStatus.Finished,
      rating: 5,
      actualHours: 15,
      mainHours: 10,
      primaryGenre: 'Plataforma',
      pace: 'Curto',
      mechanic: 'Plataforma de Precisão',
      finishedAt: '2026-03-05T10:00:00Z',
    }),
    makeGame('g4', 'Balatro', {
      status: GameStatus.Finished,
      rating: 4,
      actualHours: 80,
      mainHours: 50,
      primaryGenre: 'Roguelike e roguelite',
      pace: 'Médio',
      finishedAt: '2026-03-10T10:00:00Z',
    }),
    makeGame('g5', 'Final Fantasy VII Rebirth', {
      status: GameStatus.Playing,
      mainHours: 90,
      primaryGenre: 'RPG de ação',
      pace: 'Longo',
      desire: Desire.VeryHigh,
      startedAt: '2026-03-12T10:00:00Z',
    }),
    makeGame('g6', 'Hades II', {
      status: GameStatus.NotStarted,
      mainHours: 35,
      primaryGenre: 'Roguelike e roguelite',
      pace: 'Médio',
      desire: Desire.Immediate,
      purchasedAt: '2026-03-14T10:00:00Z',
    }),
    makeGame('g7', 'Nine Sols', {
      status: GameStatus.NotStarted,
      mainHours: 25,
      primaryGenre: 'Metroidvania',
      pace: 'Médio',
      desire: Desire.High,
      prerequisiteId: 'g2',
    }),
    makeGame('g8', 'Silksong', {
      status: GameStatus.NotStarted,
      mainHours: 40,
      primaryGenre: 'Metroidvania',
      pace: 'Médio',
      desire: Desire.High,
      prerequisiteId: 'g7',
    }),
  ];

  it('computes identical base scores and timeFactor', () => {
    const result = scoreGames(sampleGames, defaultConfig);
    expect(result.timeFactor).toBeCloseTo(1.28, 2);
    expect(result.games).toHaveLength(8);

    const scores = result.games.map((g) => ({
      id: g.id,
      baseScore: g.baseScore,
      affinity: g.affinity,
      plannedHours: g.plannedHours,
    }));

    expect(scores).toMatchSnapshot();
  });

  it('computes identical recommendations and queue entries', () => {
    const recs = recommendGames(sampleGames, defaultConfig);
    expect(recs.playing).toHaveLength(1);
    expect(recs.playing![0].id).toBe('g5');

    const queue = recs.items.map((entry) => ({
      id: entry.game.id,
      score: entry.score,
      adjustments: entry.adjustments,
    }));

    expect(queue).toMatchSnapshot();
  });
});
