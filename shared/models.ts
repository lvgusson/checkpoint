export type GameStatus = 'Não iniciado' | 'Jogando' | 'Abandonado' | 'Finalizado';
/** "Imediata" vai para o topo da fila por pontuação (ver recommendGames). */
export type Desire = 'Imediata' | 'Muito Alta' | 'Alta' | 'Média' | 'Baixa' | 'Muito Baixa';
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
export interface ScoringConfig {
  weights: ScoreWeights;
  rules: ScoringRules;
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
  /** Posição fixada pelo usuário ao arrastar (null = posição livre, decidida pelo algoritmo). */
  pinnedPosition: number | null;
  /** Ficou antes do jogo anterior da série por causa de uma posição fixa (mostrar aviso). */
  pinnedBeforePrerequisite: boolean;
}
/**
 * Posição fixada pelo usuário (pin), separada do registro importado do jogo.
 * SQL: queue_manual_adjustment.manual_position (linha sem posição = sem pin).
 */
export interface ManualAdjustment {
  gameId: string;
  manualPosition: number;
  updatedAt: string;
}
/** Histórico de movimentos manuais (queue_move_event). */
export interface ManualMove {
  id: string;
  gameId: string;
  kind: 'reorder' | 'reset';
  fromPosition: number | null;
  toPosition: number | null;
  createdAt: string;
}
export interface ReorderRequest {
  gameId: string;
  toPosition: number;
}
/** Resposta imediata do reorder: validado; o recálculo e a gravação seguem em background. */
export interface ReorderAccepted {
  accepted: true;
  gameId: string;
  fromPosition: number;
  toPosition: number;
}
export interface ManualResetResult {
  gameId: string;
  /** false quando o jogo não tinha posição fixada. */
  removed: boolean;
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
