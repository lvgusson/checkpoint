import {
  type FilterOption,
  type FilterOptions,
  type Game,
  type QueueFilters,
  type ScoredGame,
  type ScoreWeights,
  type ScoringConfig,
  type ScoringRules,
  type Recommendations,
  type QueueEntry,
  Desire,
  GameStatus,
} from '../../../../packages/core/src/models.ts';

export const defaultWeights: ScoreWeights = {
  desire: 0.5,
  affinity: 0.35,
  duration: 0.15,
  recentPurchase: 10,
  inProgress: 8,
  repeatGenre: 18,
  repeatGenreTwoBack: 8,
  repeatMechanic: 10,
  longHours: 40,
  consecutiveLong: 24,
  recentHours: 90,
  longAfterHeavy: 12,
  repeatPace: 6,
  contrastingPace: 8,
  shortAfterLong: 6,
  shortHours: 12,
  freeDurationHours: 8,
  priorStrength: 2,
  neutralAffinity: 50,
  repeatTag: 8,
  repeatTagTwoBack: 4,
};
/**
 * Tudo ligado reproduz o comportamento original da fila. A única regra nova que mudaria
 * a fila (excluir competitivos/online) nasce desligada.
 */
export const defaultRules: ScoringRules = {
  desire: true,
  affinity: true,
  duration: true,
  timeFactor: true,
  inProgress: true,
  repeatGenre: true,
  repeatGenreTwoBack: true,
  repeatMechanic: true,
  repeatTag: true,
  repeatTagTwoBack: true,
  consecutiveLong: true,
  longAfterHeavy: true,
  repeatPace: true,
  contrastingPace: true,
  shortAfterLong: true,
  excludeEndless: true,
  excludeAbandoned: true,
  excludeCompetitive: false,
  prerequisites: true,
  manual: true,
};
/** Filtros neutros: nenhum jogo removido. */
export const defaultFilters: QueueFilters = {
  excludedGenres: [],
  excludedTags: [],
  stores: [],
  paces: [],
  minHours: null,
  maxHours: null,
  excludeUnknownHours: false,
  coopOnly: false,
  minDesire: null,
};
export const defaultConfig: ScoringConfig = {
  weights: defaultWeights,
  rules: defaultRules,
  filters: defaultFilters,
};
const round = (n: number, places = 1) =>
  Math.round((n + Number.EPSILON) * 10 ** places) / 10 ** places;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const validHours = (n: number | null) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const estimate = (g: Game) =>
  [g.extraHours, g.mainHours, g.previousEstimatedHours].find(validHours) ?? null;
const median = (ns: number[]) => {
  const sorted = [...ns].sort((a, b) => a - b),
    m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
};
const normalCache = new Map<string, string>();
const normal = (s: string) => {
  let n = normalCache.get(s);
  if (n === undefined) {
    n = s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
    if (normalCache.size > 50000) normalCache.clear();
    normalCache.set(s, n);
  }
  return n;
};
const finiteCampaign = (g: Game) => normal(g.structure) !== 'sem fim definido';
/** Competitivo/online: não há campo próprio nos dados, então usa gênero e mecânica. */
const competitiveGenres = new Set(['luta', 'esporte', 'mmorpg']);
const competitiveMechanics = new Set(['esporte', 'progressao online']);
export const isCompetitive = (g: Game) =>
  competitiveGenres.has(normal(g.primaryGenre)) || competitiveMechanics.has(normal(g.mechanic));
/** Ainda por jogar (não finalizado), conforme as regras de elegibilidade de status/fim. */
const pending = (g: Game, r: ScoringRules) =>
  (g.status === GameStatus.NotStarted ||
    g.status === GameStatus.Playing ||
    (g.status === GameStatus.Abandoned && !r.excludeAbandoned)) &&
  (finiteCampaign(g) || !r.excludeEndless);
/** Pontos da vontade, da maior para a menor (a ordem das chaves é o ranking do filtro). */
const desires: Record<string, number> = {
  // Peso neutro (igual a Muito Alta): o topo de "Imediata" vem da ordenação da fila.
  [Desire.Immediate]: 100,
  [Desire.VeryHigh]: 100,
  [Desire.High]: 75,
  [Desire.Medium]: 50,
  [Desire.Low]: 25,
  [Desire.VeryLow]: 0,
};
const desireRank = (d: string) => {
  const i = Object.keys(desires).indexOf(d);
  return i < 0 ? Object.keys(desires).indexOf(Desire.Medium) : i;
};
/** Coop: qualquer valor preenchido diferente de "Não". */
const hasCoop = (g: Game) => !!g.coop?.trim() && normal(g.coop) !== 'nao';
const normalSet = (values: string[]) => new Set(values.map(normal));

/**
 * Predicado dos filtros de conteúdo: devolve o motivo de exclusão ou null.
 * Horas = plannedHours (o que a fila mostra e soma); sem tempo passa pelos limites,
 * exceto com `excludeUnknownHours`.
 */
export function contentFilter(f: QueueFilters): (g: ScoredGame) => string | null {
  const genres = normalSet(f.excludedGenres),
    tags = normalSet(f.excludedTags),
    stores = normalSet(f.stores),
    paces = normalSet(f.paces);
  const minDesire = f.minDesire === null ? null : desireRank(f.minDesire);
  return (g) => {
    if (genres.has(normal(g.primaryGenre))) return 'Filtro: gênero ' + g.primaryGenre;
    const tag = g.secondaryTags.find((t) => tags.has(normal(t)));
    if (tag) return 'Filtro: tag ' + tag;
    if (stores.size && !stores.has(normal(g.store))) return 'Filtro: loja ' + (g.store || '—');
    if (paces.size && !paces.has(normal(g.pace))) return 'Filtro: ritmo ' + (g.pace || '—');
    if (f.coopOnly && !hasCoop(g)) return 'Filtro: sem coop';
    if (minDesire !== null && desireRank(g.desire) > minDesire)
      return 'Filtro: vontade ' + g.desire;
    const h = g.plannedHours;
    if (h === null) return f.excludeUnknownHours ? 'Filtro: sem tempo estimado' : null;
    if (f.minHours !== null && h < f.minHours) return `Filtro: menos de ${f.minHours} h`;
    if (f.maxHours !== null && h > f.maxHours) return `Filtro: mais de ${f.maxHours} h`;
    return null;
  };
}

export function scoreGames(
  games: Game[],
  { weights: w, rules: r }: ScoringConfig = defaultConfig,
): { games: ScoredGame[]; timeFactor: number } {
  const now = Date.now();
  const ratios = games
    .filter(
      (g) =>
        g.status === GameStatus.Finished &&
        finiteCampaign(g) &&
        validHours(g.actualHours) &&
        estimate(g) !== null,
    )
    .map((g) => g.actualHours! / estimate(g)!);
  const timeFactor =
    r.timeFactor && ratios.length
      ? clamp((2 + ratios.length * median(ratios)) / (2 + ratios.length), 0.5, 2)
      : 1;
  const ratings = games.filter(
    (g) => typeof g.rating === 'number' && g.rating >= 1 && g.rating <= 5,
  );
  const preference = (value: string, key: 'primaryGenre' | 'pace' | 'mechanic') => {
    const matched = value ? ratings.filter((g) => normal(g[key]) === normal(value)) : [];
    return (
      (w.neutralAffinity * w.priorStrength +
        matched.reduce((sum, g) => sum + 25 * (g.rating! - 1), 0)) /
      (w.priorStrength + matched.length)
    );
  };
  return {
    timeFactor,
    games: games.map((g) => {
      const base = estimate(g);
      const plannedHours =
        !finiteCampaign(g) || base === null
          ? null
          : pending(g, r)
            ? round(base * timeFactor)
            : base;
      const affinity = round(
        (preference(g.primaryGenre, 'primaryGenre') +
          preference(g.pace, 'pace') +
          preference(g.mechanic, 'mechanic')) /
          3,
      );
      const duration =
        plannedHours === null ? 50 : clamp(100 + w.freeDurationHours - plannedHours, 0, 100);
      const purchased = g.purchasedAt ? Date.parse(g.purchasedAt) : NaN;
      const recentPurchase = Number.isFinite(purchased)
        ? w.recentPurchase * clamp(1 - (now - purchased) / (30 * 86400000), 0, 1)
        : 0;
      return {
        ...g,
        plannedHours,
        affinity,
        baseScore: round(
          (r.desire ? w.desire * (desires[g.desire] ?? 50) : 0) +
            (r.affinity ? w.affinity * affinity : 0) +
            (r.duration ? w.duration * duration : 0) +
            recentPurchase,
        ),
        coverUrl: g.steamAppId
          ? `https://cdn.akamai.steamstatic.com/steam/apps/${g.steamAppId}/header.jpg`
          : null,
      };
    }),
  };
}

const tagSets = new WeakMap<Game, Set<string>>();
const tagSet = (g: Game) => {
  let s = tagSets.get(g);
  if (!s) tagSets.set(g, (s = new Set(g.secondaryTags.map(normal))));
  return s;
};
function tagOverlap(a: Game, b: Game): number {
  const ta = tagSet(a),
    tb = tagSet(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}
const contextHours = (g: ScoredGame) =>
  g.status === GameStatus.Finished && validHours(g.actualHours)
    ? g.actualHours!
    : (g.plannedHours ?? 0);
function contextual(
  game: ScoredGame,
  history: ScoredGame[],
  { weights: w, rules: r }: ScoringConfig,
) {
  const adjustments: { label: string; points: number }[] = [];
  const add = (label: string, points: number) => {
    if (points) adjustments.push({ label, points: round(points, 2) });
  };
  const prev = history.at(-1),
    twoBack = history.at(-2);
  if (r.inProgress && game.status === GameStatus.Playing)
    add('Concluir o que já começou', w.inProgress);
  if (prev) {
    if (
      r.repeatGenre &&
      game.primaryGenre &&
      normal(game.primaryGenre) === normal(prev.primaryGenre)
    )
      add('Gênero repetido', -w.repeatGenre);
    if (r.repeatMechanic && game.mechanic && normal(game.mechanic) === normal(prev.mechanic))
      add('Mesma mecânica', -w.repeatMechanic);
    if (r.repeatTag) add('Subgêneros repetidos', -w.repeatTag * tagOverlap(game, prev));
    if (
      r.consecutiveLong &&
      (game.plannedHours ?? 0) >= w.longHours &&
      contextHours(prev) >= w.longHours
    )
      add('Duas campanhas longas seguidas', -w.consecutiveLong);
    if (r.repeatPace && game.pace && normal(game.pace) === normal(prev.pace))
      add('Mesmo ritmo', -w.repeatPace);
    if (
      r.contrastingPace &&
      ((game.pace === 'Calmo' && prev.pace === 'Frenético') ||
        (game.pace === 'Frenético' && prev.pace === 'Calmo'))
    )
      add('Contraste de ritmo', w.contrastingPace);
    if (
      r.shortAfterLong &&
      contextHours(prev) >= w.longHours &&
      game.plannedHours !== null &&
      game.plannedHours <= w.shortHours
    )
      add('Respiro curto depois de um longo', w.shortAfterLong);
  }
  if (twoBack) {
    if (
      r.repeatGenreTwoBack &&
      game.primaryGenre &&
      normal(game.primaryGenre) === normal(twoBack.primaryGenre)
    )
      add('Gênero repetido há duas posições', -w.repeatGenreTwoBack);
    if (r.repeatTagTwoBack)
      add('Subgêneros de duas posições atrás', -w.repeatTagTwoBack * tagOverlap(game, twoBack));
  }
  if (
    r.longAfterHeavy &&
    (game.plannedHours ?? 0) >= w.longHours &&
    history.slice(-3).reduce((s, g) => s + contextHours(g), 0) >= w.recentHours
  )
    add('Campanha longa após carga recente alta', -w.longAfterHeavy);
  return {
    score: round(game.baseScore + adjustments.reduce((s, a) => s + a.points, 0)),
    adjustments,
  };
}

/** Posição fixada pelo usuário ao arrastar um jogo na fila (1 = primeiro). */
export interface ManualPin {
  gameId: string;
  position: number;
}

/**
 * Ordem de inserção dos pins: X crescente; no empate, o mais recente (mais ao fim de `pins`)
 * entra primeiro e fica em X, o outro vai para X+1. Um jogo com dois pins usa o último.
 */
function orderPins(pins: readonly ManualPin[], eligible: Set<string>) {
  const latest = new Map<string, { pin: ManualPin; index: number }>();
  pins.forEach((pin, index) => {
    if (eligible.has(pin.gameId) && Number.isFinite(pin.position))
      latest.set(pin.gameId, { pin, index });
  });
  return [...latest.values()]
    .sort((a, b) => a.pin.position - b.pin.position || b.index - a.index)
    .map((x) => x.pin);
}

/**
 * Fila exibida = merge, em memória, de dois modelos:
 * (a) fila por pontuação, gulosa: a cada posição o maior score contextual entre os jogos
 *     disponíveis; jogos com vontade "Imediata" vêm antes de todos (entre si, pelo score).
 *     Os jogos fixados ficam FORA deste cálculo, inclusive do contexto dos vizinhos;
 * (b) posições fixas (`pins`, do mais antigo ao mais recente): inseridas depois, em X
 *     crescente, empurrando o resto para baixo; X além do fim vai para o fim.
 * O contexto não é recalculado ao redor dos fixos (simples e previsível).
 */
export function recommendGames(
  games: Game[],
  config: ScoringConfig = defaultConfig,
  pins: readonly ManualPin[] = [],
): Recommendations {
  const r = config.rules;
  const scored = scoreGames(games, config),
    all = new Map(scored.games.map((g) => [g.id, g]));
  const playing = scored.games
    .filter((g) => g.status === GameStatus.Playing)
    .sort(
      (a, b) =>
        (a.startedAt ?? '9999').localeCompare(b.startedAt ?? '9999') ||
        a.name.localeCompare(b.name, 'pt-BR') ||
        a.id.localeCompare(b.id),
    );
  const filtered: Recommendations['excluded'] = [];
  const reasonOf = contentFilter(config.filters);
  const inQueue: ScoredGame[] = [];
  for (const g of scored.games.filter((g) => eligible(g, r))) {
    const reason = reasonOf(g);
    if (reason) filtered.push({ gameId: g.id, reason });
    else inQueue.push(g);
  }
  // Filtrado pela lista também perde o pin.
  const pinOrder = r.manual ? orderPins(pins, new Set(inQueue.map((g) => g.id))) : [];
  const pinnedIds = new Set(pinOrder.map((p) => p.gameId));
  const remaining = new Map(inQueue.filter((g) => !pinnedIds.has(g.id)).map((g) => [g.id, g]));
  // Fixados não bloqueiam continuações: a posição deles é decidida pelo usuário.
  const candidates = new Set(remaining.keys());
  const played = scored.games
    .filter((g) => g.status === GameStatus.Finished && g.finishedAt)
    .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
    .slice(-3);
  const selected = new Set<string>();
  type Pick = { game: ScoredGame; score: number; adjustments: QueueEntry['adjustments'] };
  const picks: (Pick & { pinned: boolean })[] = [];
  const available = (g: Game) => {
    if (!r.prerequisites) return true;
    const seen = new Set<string>([g.id]);
    let predecessor = g.prerequisiteId;
    while (predecessor) {
      if (selected.has(predecessor)) return true;
      if (seen.has(predecessor)) return false;
      seen.add(predecessor);
      const pre = all.get(predecessor);
      if (!pre) return true; // Removido ou fora da biblioteca: não cria bloqueio eterno.
      // Predecessor ainda na fila (não escolhido) bloqueia; fora da fila, não.
      if (candidates.has(predecessor)) return false;
      predecessor = pre.prerequisiteId;
    }
    return true;
  };
  while (remaining.size) {
    const history = [...played, ...picks.map((i) => i.game)].slice(-3);
    const open = [...remaining.values()].filter(available);
    if (!open.length) break;
    const urgent = open.filter((g) => g.desire === Desire.Immediate);
    const options = (urgent.length ? urgent : open).map((game) => ({
      game,
      ...contextual(game, history, config),
    }));
    // Mesmo critério de antes (maior score, empate pelo ID), sem ordenar tudo.
    let winner = options[0];
    for (const c of options)
      if ((c.score - winner.score || winner.game.id.localeCompare(c.game.id)) > 0) winner = c;
    picks.push({ ...winner, pinned: false });
    selected.add(winner.game.id);
    remaining.delete(winner.game.id);
  }
  // (b) sobre (a): cada fixo entra em X (ou logo depois do fixo anterior, no empate).
  let last = 0;
  for (const pin of pinOrder) {
    const game = all.get(pin.gameId)!;
    const at = Math.min(Math.max(Math.round(pin.position), last + 1), picks.length + 1);
    picks.splice(at - 1, 0, { game, ...contextual(game, [], config), pinned: true });
    last = at;
  }
  const index = new Map(picks.map((p, i) => [p.game.id, i]));
  /** Fica antes do primeiro predecessor que está na fila (só acontece por causa de um fixo). */
  const beforePrerequisite = (g: Game) => {
    if (!r.prerequisites) return false;
    const seen = new Set([g.id]);
    for (let p = g.prerequisiteId; p && !seen.has(p); p = all.get(p)?.prerequisiteId ?? null) {
      if (index.has(p)) return index.get(p)! > index.get(g.id)!;
      seen.add(p);
    }
    return false;
  };
  let cumulativeHours = 0;
  const items: QueueEntry[] = picks.map(({ pinned, ...pick }, i) => {
    cumulativeHours = round(cumulativeHours + (pick.game.plannedHours ?? 0));
    const early = beforePrerequisite(pick.game);
    return {
      ...pick,
      position: i + 1,
      cumulativeHours,
      pinnedPosition: pinned ? i + 1 : null,
      pinnedBeforePrerequisite: early,
      reasons: [
        ...(pinned ? ['Posição fixada por você'] : []),
        ...(early ? ['Antes do jogo anterior da série'] : []),
        ...(pick.game.desire === Desire.Immediate && !pinned ? ['Vontade imediata'] : []),
        ...(pick.adjustments.length
          ? pick.adjustments.map((a) => a.label)
          : pinned || pick.game.desire === Desire.Immediate
            ? []
            : ['Maior prioridade disponível']),
        ...(pick.game.plannedHours === null ? ['Tempo a confirmar'] : []),
      ],
    };
  });
  return {
    items,
    playing,
    total: items.length,
    estimatedHours: cumulativeHours,
    timeFactor: round(scored.timeFactor, 4),
    weights: config.weights,
    rules: config.rules,
    filters: config.filters,
    configVersion: 0,
    excluded: [
      ...[...remaining.keys()].map((gameId) => ({
        gameId,
        reason: 'Dependência circular ou predecessor indisponível',
      })),
      ...filtered,
    ],
  };
}

/** Elegível pelas regras de status/fim/competitivos (antes dos filtros de conteúdo). */
const eligible = (g: Game, r: ScoringRules) =>
  g.status !== GameStatus.Playing && pending(g, r) && !(r.excludeCompetitive && isCompetitive(g));

/** Valores dos filtros com contagem sobre os candidatos da fila sem filtros de conteúdo. */
export function filterOptions(games: Game[], config: ScoringConfig = defaultConfig): FilterOptions {
  const candidates = scoreGames(games, config).games.filter((g) => eligible(g, config.rules));
  const count = (values: string[]): FilterOption[] => {
    const m = new Map<string, FilterOption>();
    for (const v of values) {
      if (!v.trim()) continue;
      const key = normal(v);
      const o = m.get(key);
      if (o) o.count++;
      else m.set(key, { value: v.trim(), count: 1 });
    }
    return [...m.values()].sort(
      (a, b) => b.count - a.count || a.value.localeCompare(b.value, 'pt-BR'),
    );
  };
  return {
    total: candidates.length,
    genres: count(candidates.map((g) => g.primaryGenre)),
    tags: count(candidates.flatMap((g) => [...new Set(g.secondaryTags)])),
    stores: count(candidates.map((g) => g.store)),
    paces: count(candidates.map((g) => g.pace)),
    desires: Object.keys(desires).map((value) => ({
      value,
      count: candidates.filter((g) => g.desire === value).length,
    })),
    coop: candidates.filter(hasCoop).length,
    hours: candidates.map((g) => g.plannedHours),
  };
}

/** Plano de um arraste: posições a gravar para que a fila fique igual à que o usuário vê. */
export interface MovePlan {
  gameId: string;
  fromPosition: number;
  toPosition: number;
  /** Pins novos ou alterados (o jogo movido + fixos que mudaram de índice na tela). */
  pins: ManualPin[];
}

/**
 * Aplica o arraste sobre a fila atual exatamente como o front (remove e insere) e devolve os
 * pins a gravar: o jogo movido em `toPosition` e os fixos que o arraste deslocou no índice
 * visível (senão a próxima leitura os devolveria ao X antigo). Pré-requisito não bloqueia:
 * o jogo fica onde foi solto e o item sai marcado com `pinnedBeforePrerequisite`.
 * Lança RangeError se o jogo não estiver na fila ou a posição estiver fora dela.
 */
export function planMove(queue: Recommendations, gameId: string, toPosition: number): MovePlan {
  const order = queue.items.map((i) => i.game.id);
  const from = order.indexOf(gameId);
  if (from < 0) throw new RangeError('O jogo não está na fila');
  if (!Number.isInteger(toPosition) || toPosition < 1 || toPosition > order.length)
    throw new RangeError(`toPosition deve estar entre 1 e ${order.length}`);
  order.splice(from, 1);
  order.splice(toPosition - 1, 0, gameId);
  const pinned = new Map(queue.items.map((i) => [i.game.id, i.pinnedPosition]));
  const pins = order.flatMap((id, i) =>
    id === gameId || (pinned.get(id) != null && pinned.get(id) !== i + 1)
      ? [{ gameId: id, position: i + 1 }]
      : [],
  );
  return { gameId, fromPosition: from + 1, toPosition, pins };
}
