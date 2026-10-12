import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameService } from '../src/service.ts';
import { LocalGameRepository } from '../src/repository.ts';
import { seedGames } from '../src/seed.ts';

test('catalog includes unused controlled options and rejects arbitrary metadata edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'metadata-'));
  try {
    const service = new GameService(
      new LocalGameRepository([seedGames[0]], join(directory, 'games.json')),
    );
    const catalog = await service.catalog();
    assert(catalog.platforms.includes('PlayStation 5'));
    assert(catalog.genres.includes('Puzzle'));
    assert.deepEqual(catalog.paces, ['Calmo', 'Frenético', 'Moderado']);
    for (const field of ['primaryGenre', 'pace', 'mechanic', 'structure', 'platform', 'store'])
      await assert.rejects(service.patch(seedGames[0].id, { [field]: 'arbitrary value' }));
    await assert.rejects(service.patch(seedGames[0].id, { secondaryTags: ['arbitrary value'] }));
    await assert.rejects(service.patch(seedGames[0].id, { secondaryTags: ['Puzzle', 'puzzle'] }));
    const updated = await service.patch(seedGames[0].id, {
      pace: '  frenetico ',
      secondaryTags: ['puzzle'],
    });
    assert.equal(updated.pace, 'Frenético');
    assert.deepEqual(updated.secondaryTags, ['Puzzle']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
