export type GameStatus = 'Não iniciado' | 'Jogando' | 'Abandonado' | 'Finalizado';
export type Desire = 'Muito Alta' | 'Alta' | 'Média' | 'Baixa' | 'Muito Baixa';
export interface Game {
  id: string;
  name: string;
  primaryGenre: string;
  status: GameStatus;
  desire: Desire;
  store: string;
  platform: string;
  secondaryTags: string[];
  pace: string;
  structure: string;
  actualHours: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  rating: number | null;
  notes: string;
  mainHours: number | null;
  extraHours: number | null;
  completionistHours: number | null;
  size: string;
  timeVerification: string;
  timeSource: string;
  reviewNotes: string;
  previousEstimatedHours: number | null;
  coop: string;
  mechanic: string;
  prerequisiteId: string | null;
  steamAppId: number | null;
  steamHours: number | null;
  steamUpdatedAt: string | null;
  updatedAt: string | null;
  imported: {
    plannedHours: number | null;
    affinity: number | null;
    baseScore: number | null;
    queueScore: number | null;
    previousPendingId: string | null;
  };
}
export interface ScoreWeights {
  desire: number;
  affinity: number;
  duration: number;
  inProgress: number;
  repeatGenre: number;
  repeatGenreTwoBack: number;
  repeatMechanic: number;
  longHours: number;
  consecutiveLong: number;
  recentHours: number;
  longAfterHeavy: number;
  repeatPace: number;
  contrastingPace: number;
  shortAfterLong: number;
  shortHours: number;
  freeDurationHours: number;
  priorStrength: number;
  neutralAffinity: number;
  repeatTag: number;
  repeatTagTwoBack: number;
}
/**
 * Regras do algoritmo que podem ser ligadas/desligadas. Desligada = contribuição 0
 * (termos/ajustes) ou filtro não aplicado (elegibilidade).
 */
export type ScoringRuleId =
  // score base
  | 'desire'
  | 'affinity'
  | 'duration'
  | 'timeFactor'
  // ajustes contextuais
  | 'inProgress'
  | 'repeatGenre'
  | 'repeatGenreTwoBack'
  | 'repeatMechanic'
  | 'repeatTag'
  | 'repeatTagTwoBack'
  | 'consecutiveLong'
  | 'longAfterHeavy'
  | 'repeatPace'
  | 'contrastingPace'
  | 'shortAfterLong'
  // elegibilidade
  | 'excludeEndless'
  | 'excludeAbandoned'
  | 'excludeCompetitive'
  | 'prerequisites'
  // ajuste manual (reordenação)
  | 'manual';
export type ScoringRules = Record<ScoringRuleId, boolean>;
/**
 * Filtros de conteúdo da fila (quem entra). Padrão neutro: listas vazias, limites null
 * e booleanos false não removem nada. Textos comparados sem acento/maiúsculas.
 */
export interface QueueFilters {
  /** Gêneros principais que ficam fora. */
  excludedGenres: string[];
  /** Fica fora o jogo com qualquer uma destas tags secundárias. */
  excludedTags: string[];
  /** Só estas lojas (vazio = todas). */
  stores: string[];
  /** Só estes ritmos (vazio = todos). */
  paces: string[];
  /** Limites em horas previstas (plannedHours: estimativa × seu ritmo); null = sem limite. */
  minHours: number | null;
  maxHours: number | null;
  /** Tira jogos sem tempo estimado (por padrão eles passam pelos limites de horas). */
  excludeUnknownHours: boolean;
  /** Só jogos com coop (local e/ou online). */
  coopOnly: boolean;
  /** Vontade mínima (null = qualquer). */
  minDesire: Desire | null;
}
export interface ScoringConfig {
  weights: ScoreWeights;
  rules: ScoringRules;
  filters: QueueFilters;
}
/** Valor possível de um filtro e quantos jogos da fila (sem filtros) o têm. */
export interface FilterOption {
  value: string;
  count: number;
}
/** Opções dos filtros, contadas sobre a fila sem filtros de conteúdo. */
export interface FilterOptions {
  total: number;
  genres: FilterOption[];
  tags: FilterOption[];
  stores: FilterOption[];
  paces: FilterOption[];
  desires: FilterOption[];
  coop: number;
  /** Horas previstas de cada candidato (null = sem tempo), para contar o efeito dos limites. */
  hours: (number | null)[];
}
export type ScoringSection = 'base' | 'context' | 'filter' | 'manual' | 'params';
/** Uma linha da tabela de configuração (fator, regra e/ou parâmetro). */
export interface ScoringFactor {
  id: string;
  section: ScoringSection;
  label: string;
  description: string;
  /** Peso/parâmetro editável desta linha (null = regra sem peso, só liga/desliga). */
  weight: keyof ScoreWeights | null;
  /** Regra que liga/desliga a linha (null = parâmetro sempre usado pelas regras). */
  rule: ScoringRuleId | null;
  unit: string;
  min: number;
  max: number;
  step: number;
}
export interface ScoringSettings {
  config: ScoringConfig;
  /** Sobe a cada gravação (0 = nunca salvo, usando o padrão). */
  version: number;
  updatedAt: string | null;
  defaults: ScoringConfig;
  factors: ScoringFactor[];
  filterOptions: FilterOptions;
}
export interface ScoredGame extends Game {
  plannedHours: number | null;
  affinity: number;
  baseScore: number;
  coverUrl: string | null;
}
export interface QueueEntry {
  position: number;
  game: ScoredGame;
  score: number;
  cumulativeHours: number;
  reasons: string[];
  adjustments: { label: string; points: number }[];
  /** Pontos flat definidos pelo usuário ao reordenar a fila (0 = sem ajuste). */
  manualPoints: number;
}
/**
 * Ajuste manual de prioridade, separado do registro importado do jogo.
 * Mapeamento SQL sugerido: game_id, manual_points, manual_position, updated_at.
 */
export interface ManualAdjustment {
  gameId: string;
  manualPoints: number;
  /** Posição pedida pelo usuário no último arraste (intenção, não garantia). */
  manualPosition: number | null;
  updatedAt: string;
}
/**
 * Histórico de movimentos manuais.
 * Mapeamento SQL sugerido: id, game_id, kind, from_position, to_position,
 * effective_position, points_delta, manual_points_after, created_at.
 */
export interface ManualMove {
  id: string;
  gameId: string;
  kind: 'reorder' | 'reset';
  fromPosition: number | null;
  toPosition: number | null;
  effectivePosition: number | null;
  pointsDelta: number;
  manualPointsAfter: number;
  createdAt: string;
}
export interface ReorderRequest {
  gameId: string;
  toPosition: number;
}
export interface ReorderResult {
  gameId: string;
  fromPosition: number;
  requestedPosition: number;
  effectivePosition: number;
  /** true quando a posição efetiva é exatamente a pedida. */
  exact: boolean;
  pointsDelta: number;
  manualPoints: number;
  recommendations: Recommendations;
}
export interface ManualResetResult {
  gameId: string;
  pointsDelta: number;
  manualPoints: number;
  recommendations: Recommendations;
}
export interface ManualState {
  adjustments: ManualAdjustment[];
  moves: ManualMove[];
}
export interface Recommendations {
  items: QueueEntry[];
  total: number;
  estimatedHours: number;
  timeFactor: number;
  weights: ScoreWeights;
  rules: ScoringRules;
  filters: QueueFilters;
  /** Versão da configuração usada (o front compara com o cache local). */
  configVersion: number;
  excluded: { gameId: string; reason: string }[];
}
export interface GamePage {
  items: ScoredGame[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Catalog {
  genres: string[];
  stores: string[];
  tags: string[];
  statuses: GameStatus[];
  desires: Desire[];
  counts: {
    total: number;
    completed: number;
    playing: number;
    pending: number;
  };
}
