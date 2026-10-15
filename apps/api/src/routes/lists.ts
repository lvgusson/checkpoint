// Rotas de listas (/api/v1/lists...), da fila e da configuração de pontuação, que também
// existem sem o prefixo da lista (= lista padrão).
import type { IncomingMessage } from 'node:http';
import type { GameService } from '../services/games.ts';
import { runInBackground } from './background.ts';
import { createRequestAdmission } from '../shared/request-guard.ts';
import { getContext } from '../shared/context.ts';

const admitReorder = createRequestAdmission(30, 60_000);
import { ApiPath, HttpMethod, type ReadJson, type RouteResult } from './http.ts';

export async function listsRoute(
  service: GameService,
  req: IncomingMessage,
  url: URL,
  readJson: ReadJson,
): Promise<RouteResult> {
  const path = url.pathname;
  const method = req.method;
  if (path === ApiPath.Lists) {
    if (method === HttpMethod.Get) return { data: await service.allLists() };
    if (method === HttpMethod.Post)
      return { data: await service.createList(await readJson()), status: 201 };
  }
  const listMatch = path.match(/^\/api\/v1\/lists\/([^/]+)$/);
  if (listMatch) {
    const listId = decodeURIComponent(listMatch[1]);
    if (method === HttpMethod.Patch)
      return { data: await service.renameList(listId, await readJson()) };
    if (method === HttpMethod.Delete) {
      await service.deleteList(listId);
      return { status: 204 };
    }
  }
  // Rotas da fila/configuração: /api/v1/lists/{listId}/... ou, sem o prefixo, a lista padrão.
  const scoped = path.match(
    /^\/api\/v1(?:\/lists\/([^/]+))?(\/recommendations|\/queue\/reorder|\/queue\/adjustments(?:\/[^/]+)?|\/settings\/scoring(?:\/reset)?)$/,
  );
  if (!scoped) return null;
  const listId = scoped[1] === undefined ? undefined : decodeURIComponent(scoped[1]);
  const route = scoped[2];
  if (route === '/recommendations' && method === HttpMethod.Get)
    return { data: await service.recommendations(listId) };
  if (route === '/queue/reorder' && method === HttpMethod.Post) {
    const body = await readJson();
    // 200 assim que validar; o recálculo e a gravação continuam depois da resposta.
    const release = admitReorder(getContext()?.userId ?? 'local');
    try {
      const { accepted, done } = await service.reorder(body.gameId, body.toPosition, listId);
      runInBackground(done.finally(release));
      return { data: { ...accepted, status: 'accepted' } };
    } catch (error) {
      release();
      throw error;
    }
  }
  if (route === '/queue/adjustments' && method === HttpMethod.Get)
    return { data: await service.manualState(listId) };
  if (route.startsWith('/queue/adjustments/') && method === HttpMethod.Delete) {
    const gameId = decodeURIComponent(route.slice('/queue/adjustments/'.length));
    return { data: await service.resetManual(gameId, listId) };
  }
  if (route === '/settings/scoring' && method === HttpMethod.Get)
    return { data: await service.scoringSettings(listId) };
  if (route === '/settings/scoring' && method === HttpMethod.Put)
    return { data: await service.saveScoringSettings(await readJson(), listId) };
  if (route === '/settings/scoring/reset' && method === HttpMethod.Post)
    return { data: await service.resetScoringSettings(listId) };
  return null;
}
