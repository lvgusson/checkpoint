import type {
  Game,
  ScoredGame,
  ScoreWeights,
  ScoringConfig,
  ScoringRules,
  Recommendations,
  QueueEntry,
} from '../../shared/models.ts';

export const defaultWeights: ScoreWeights = {
  desire: 0.5,
  affinity: 0.35,
  duration: 0.15,
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
export const defaultConfig: ScoringConfig = { weights: defaultWeights, rules: defaultRules };
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
  (g.status === 'Não iniciado' ||
    g.status === 'Jogando' ||
    (g.status === 'Abandonado' && !r.excludeAbandoned)) &&
  (finiteCampaign(g) || !r.excludeEndless);

export function scoreGames(
  games: Game[],
  { weights: w, rules: r }: ScoringConfig = defaultConfig,
): { games: ScoredGame[]; timeFactor: number } {
  const ratios = games
    .filter(
      (g) =>
        g.status === 'Finalizado' &&
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
  const desires: Record<string, number> = {
    'Muito Alta': 100,
    Alta: 75,
    Média: 50,
    Baixa: 25,
    'Muito Baixa': 0,
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
      return {
        ...g,
        plannedHours,
        affinity,
        baseScore: round(
          (r.desire ? w.desire * (desires[g.desire] ?? 50) : 0) +
            (r.affinity ? w.affinity * affinity : 0) +
            (r.duration ? w.duration * duration : 0),
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
  g.status === 'Finalizado' && validHours(g.actualHours) ? g.actualHours! : (g.plannedHours ?? 0);
function contextual(
  game: ScoredGame,
  history: ScoredGame[],
  { weights: w, rules: r }: ScoringConfig,
  manualPoints = 0,
) {
  const adjustments: { label: string; points: number }[] = [];
  const add = (label: string, points: number) => {
    if (points) adjustments.push({ label, points: round(points, 2) });
  };
  const prev = history.at(-1),
    twoBack = history.at(-2);
  if (r.inProgress && game.status === 'Jogando') add('Concluir o que já começou', w.inProgress);
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
  if (r.manual && Number.isFinite(manualPoints)) add('Ajuste manual', manualPoints);
  return {
    score: round(game.baseScore + adjustments.reduce((s, a) => s + a.points, 0)),
    adjustments,
  };
}

/** gameId -> pontos flat definidos pelo usuário (ausente = 0). */
export type ManualPoints = Readonly<Record<string, number>>;

export function recommendGames(
  games: Game[],
  config: ScoringConfig = defaultConfig,
  manual: ManualPoints = {},
): Recommendations {
  const r = config.rules;
  const manualOf = (id: string) =>
    r.manual && Object.hasOwn(manual, id) && Number.isFinite(manual[id]) ? manual[id] : 0;
  const scored = scoreGames(games, config),
    all = new Map(scored.games.map((g) => [g.id, g]));
  const remaining = new Map(
    scored.games
      .filter((g) => pending(g, r) && !(r.excludeCompetitive && isCompetitive(g)))
      .map((g) => [g.id, g]),
  );
  const candidates = new Set(remaining.keys());
  const played = scored.games
    .filter((g) => g.status === 'Finalizado' && g.finishedAt)
    .sort((a, b) => a.finishedAt!.localeCompare(b.finishedAt!))
    .slice(-3);
  const selected = new Set<string>(),
    items: QueueEntry[] = [];
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
  let cumulativeHours = 0;
  while (remaining.size) {
    const history = [...played, ...items.map((i) => i.game)].slice(-3);
    const options = [...remaining.values()].filter(available).map((game) => ({
      game,
      ...contextual(game, history, config, manualOf(game.id)),
    }));
    if (!options.length) break;
    // Mesmo critério de antes (maior score, empate pelo ID), sem ordenar tudo.
    let winner = options[0];
    for (const c of options)
      if ((c.score - winner.score || winner.game.id.localeCompare(c.game.id)) > 0) winner = c;
    cumulativeHours = round(cumulativeHours + (winner.game.plannedHours ?? 0));
    items.push({
      ...winner,
      position: items.length + 1,
      cumulativeHours,
      manualPoints: round(manualOf(winner.game.id)),
      reasons: [
        ...(winner.adjustments.length
          ? winner.adjustments.map((a) => a.label)
          : ['Maior prioridade disponível']),
        ...(winner.game.plannedHours === null ? ['Tempo a confirmar'] : []),
      ],
    });
    selected.add(winner.game.id);
    remaining.delete(winner.game.id);
  }
  return {
    items,
    total: items.length,
    estimatedHours: cumulativeHours,
    timeFactor: round(scored.timeFactor, 4),
    weights: config.weights,
    rules: config.rules,
    configVersion: 0,
    excluded: [...remaining.keys()].map((gameId) => ({
      gameId,
      reason: 'Dependência circular ou predecessor indisponível',
    })),
  };
}

export interface ManualSolution {
  gameId: string;
  fromPosition: number;
  requestedPosition: number;
  effectivePosition: number;
  exact: boolean;
  /** Novo total de pontos manuais do jogo (acumulado). */
  manualPoints: number;
  /** Diferença entre o novo total e o anterior. */
  pointsDelta: number;
  evaluations: number;
}

/**
 * Descobre quantos pontos manuais um jogo precisa para cair em `target`.
 *
 * O algoritmo da fila é guloso e contextual, então não há fórmula fechada:
 * 1. palpite inicial = diferença de score para o jogo hoje na posição alvo + margem;
 * 2. expande (dobrando) o delta até a posição alvo ser alcançada ou o limite estourar;
 *    se nem no limite ela for alcançada (predecessor, contexto), o alvo passa a ser
 *    a melhor posição alcançável;
 * 3. busca binária (resolução 0,1 ponto) pelo menor |delta| que alcança o alvo;
 * 4. tenta somar uma pequena margem, mantida só se não mudar a posição.
 * Cada passo é verificado rodando `recommendGames` de novo.
 */
export function solveManualPoints(
  games: Game[],
  gameId: string,
  target: number,
  manual: ManualPoints = {},
  config: ScoringConfig = defaultConfig,
  options: { maxEvaluations?: number; maxDelta?: number; margin?: number } = {},
): ManualSolution {
  const maxEvaluations = options.maxEvaluations ?? 48;
  const limit = Math.round((options.maxDelta ?? 1000) * 10); // décimos de ponto
  const marginTenths = Math.round((options.margin ?? 0.5) * 10);
  const current = round(
    Object.hasOwn(manual, gameId) && Number.isFinite(manual[gameId]) ? manual[gameId] : 0,
  );
  const currentTenths = Math.round(current * 10);
  const base = recommendGames(games, config, manual).items;
  const fromIndex = base.findIndex((i) => i.game.id === gameId);
  if (fromIndex < 0) throw new RangeError('Jogo fora da fila');
  const from = fromIndex + 1;
  const to = clamp(Math.round(target), 1, base.length);
  let evaluations = 0;
  const cache = new Map<number, number>([[currentTenths, from]]);
  const positionAt = (tenths: number) => {
    const hit = cache.get(tenths);
    if (hit !== undefined) return hit;
    evaluations++;
    const items = recommendGames(games, config, {
      ...manual,
      [gameId]: tenths / 10,
    }).items;
    const pos = items.findIndex((i) => i.game.id === gameId) + 1;
    cache.set(tenths, pos);
    return pos;
  };
  const result = (tenths: number, requested = to): ManualSolution => {
    const effectivePosition = positionAt(tenths);
    return {
      gameId,
      fromPosition: from,
      requestedPosition: requested,
      effectivePosition,
      exact: effectivePosition === requested,
      manualPoints: round(tenths / 10),
      pointsDelta: round((tenths - currentTenths) / 10),
      evaluations,
    };
  };
  if (to === from) return result(currentTenths);
  const forward = to < from,
    dir = forward ? 1 : -1;
  const reaches = (pos: number, goal: number) => pos > 0 && (forward ? pos <= goal : pos >= goal);

  // 1-2. Palpite inicial e expansão até cercar o alvo.
  const gap = Math.abs(base[to - 1].score - base[fromIndex].score);
  let step = Math.max(1, Math.round(gap * 10) + marginTenths);
  let failing = currentTenths;
  let passing = currentTenths,
    found = false;
  let probe = currentTenths + dir * Math.min(step, limit);
  while (evaluations < maxEvaluations) {
    if (reaches(positionAt(probe), to)) {
      passing = probe;
      found = true;
      break;
    }
    failing = probe;
    if (Math.abs(probe - currentTenths) >= limit) break;
    step *= 2;
    probe = currentTenths + dir * Math.min(step, limit);
  }
  let goal = to;
  if (!found) {
    // Posição exata impossível: mira na melhor posição vista no extremo.
    const best = positionAt(failing);
    if (!best || best === from || (forward ? best > from : best < from))
      return result(currentTenths);
    goal = best;
    passing = failing;
    failing = currentTenths;
  }
  // 3. Busca binária pelo menor |delta| que ainda alcança `goal`.
  while (Math.abs(passing - failing) > 1 && evaluations < maxEvaluations) {
    const mid: number = failing + Math.trunc((passing - failing) / 2);
    if (reaches(positionAt(mid), goal)) passing = mid;
    else failing = mid;
  }
  let chosen = passing;
  // Saltos não monotônicos podem ultrapassar o alvo: fica com o mais próximo.
  const passPos = positionAt(passing),
    failPos = positionAt(failing);
  if (passPos !== to && Math.abs(failPos - to) < Math.abs(passPos - to) && failPos !== from)
    chosen = failing;
  // 4. Margem de segurança contra empates, apenas se não mudar a posição.
  if (marginTenths && evaluations < maxEvaluations) {
    const padded = chosen + dir * marginTenths;
    if (positionAt(padded) === positionAt(chosen)) chosen = padded;
  }
  return result(chosen);
}
