import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlayingUpdates, updatePlayingQueue } from '../../web/src/playing-updates.ts';
import { scoreGames, recommendGames } from '../src/scoring.ts';
import { seedGames } from '../src/seed.ts';

const game = () =>
  scoreGames([
    {
      ...seedGames[0],
      status: 'Não iniciado',
      startedAt: null,
      prerequisiteId: null,
      structure: 'Campanha',
    },
  ]).games[0];
const deferred = () => {
  let resolve!: (value: ReturnType<typeof game>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof game>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test('playing changes immediately and keeps the latest click while saving in sequence', async () => {
  const first = deferred(),
    second = deferred();
  const writes: Record<string, unknown>[] = [];
  const events: { game: ReturnType<typeof game>; phase: string }[] = [];
  const updates = new PlayingUpdates(
    (_id, patch) => {
      writes.push(patch);
      return writes.length === 1 ? first.promise : second.promise;
    },
    (event) => events.push(event),
  );
  const original = game();
  const done = updates.toggle(original);
  assert.equal(events[0].game.status, 'Jogando');
  assert.match(events[0].game.startedAt!, /^\d{4}-\d{2}-\d{2}$/);
  updates.toggle(events[0].game);
  assert.equal(events[1].game.status, 'Não iniciado');
  assert.equal(writes.length, 1);
  first.resolve(events[0].game);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(events.at(-1)!.game.status, 'Não iniciado');
  assert.equal(writes[1].status, 'Não iniciado');
  second.resolve(events[1].game);
  await done;
  assert.equal(updates.pending, 0);
  assert.equal(events.at(-1)!.phase, 'saved');
});

test('failed playing changes restore the last confirmed server state', async () => {
  const request = deferred();
  const events: { game: ReturnType<typeof game>; phase: string }[] = [];
  const updates = new PlayingUpdates(
    () => request.promise,
    (event) => events.push(event),
  );
  const original = game();
  const done = updates.toggle(original);
  request.reject(new Error('offline'));
  await done;
  assert.equal(events.at(-1)!.phase, 'failed');
  assert.equal(events.at(-1)!.game.status, 'Não iniciado');
  assert.equal(events.at(-1)!.game.startedAt, null);
});

test('a failed response reconciles a status that was already persisted on the server', async () => {
  const original = game();
  const persisted = { ...original, status: 'Jogando' as const, startedAt: '2026-10-12' };
  const events: { game: ReturnType<typeof game>; phase: string }[] = [];
  const updates = new PlayingUpdates(
    async () => {
      throw new Error('Response failed after persistence');
    },
    (event) => events.push(event),
    async () => persisted,
  );
  await updates.toggle(original);
  assert.equal(events.at(-1)!.phase, 'failed');
  assert.equal(events.at(-1)!.game.status, 'Jogando');
  assert.equal(events.at(-1)!.game.startedAt, '2026-10-12');
});

test('dependent edits wait for the final playing intent while other games save independently', async () => {
  const first = deferred(),
    second = deferred(),
    other = deferred();
  const events: { game: ReturnType<typeof game>; phase: string }[] = [];
  let writes = 0;
  const updates = new PlayingUpdates(
    (id) => (id === 'other' ? other.promise : ++writes === 1 ? first.promise : second.promise),
    (event) => events.push(event),
  );
  const original = game();
  const done = updates.toggle(original);
  updates.toggle(events[0].game);
  const otherDone = updates.toggle({ ...original, id: 'other' });
  let editAllowed = false;
  const edit = updates.wait(original.id).then(() => {
    editAllowed = true;
  });
  other.resolve(events[2].game);
  await otherDone;
  assert.equal(editAllowed, false);
  first.resolve(events[0].game);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(editAllowed, false);
  second.resolve(events[1].game);
  await done;
  await edit;
  assert.equal(editAllowed, true);
});

test('optimistic playing moves update queue membership, positions and hours without a fetch', () => {
  const original = game();
  const queue = recommendGames([original, { ...original, id: 'second' }]);
  const started = updatePlayingQueue(queue, { ...original, status: 'Jogando' });
  assert.equal(started.playing?.length, 1);
  assert.equal(started.items.length, 1);
  assert.equal(started.items[0].position, 1);
  assert.equal(started.total, 1);
  assert.equal(started.estimatedHours, original.plannedHours ?? 0);
  const restored = updatePlayingQueue(
    started,
    original,
    queue.items.find((i) => i.game.id === original.id),
  );
  assert.deepEqual(restored.items, queue.items);
  assert.equal(restored.playing?.length, 0);
});
