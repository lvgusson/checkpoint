/** 'Desejado' = lista de desejos (ainda não tem o jogo); nunca entra na fila. */
export const GameStatus = {
  NotStarted: 'Não iniciado',
  Playing: 'Jogando',
  Abandoned: 'Abandonado',
  Finished: 'Finalizado',
  Wishlist: 'Desejado',
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];
/** "Imediata" vai para o topo da fila por pontuação (ver recommendGames). */
export const Desire = {
  Immediate: 'Imediata',
  VeryHigh: 'Muito Alta',
  High: 'Alta',
  Medium: 'Média',
  Low: 'Baixa',
  VeryLow: 'Muito Baixa',
} as const;
export type Desire = (typeof Desire)[keyof typeof Desire];
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
  /** First recorded purchase time. Absent in legacy local data. */
  purchasedAt?: string | null;
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
  coverUrl?: string | null;
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
  recentPurchase: number;
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
  /** Lista dona desta configuração. */
  listId: string;
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
  score?: number;
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
/**
 * Lista de jogos: um "guarda-chuva" com TODOS os jogos do usuário. Só o nome é dela;
 * pesos, regras, filtros e ajustes manuais da fila são aplicados por lista.
 */
export interface GameList {
  id: string;
  name: string;
  createdAt: string;
}
export interface Recommendations {
  /** Lista cuja configuração gerou esta fila (ausente em chamadas diretas ao algoritmo). */
  listId?: string;
  /** Games currently being played, independent of the selected list's queue filters. */
  playing?: ScoredGame[];
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
  paces: string[];
  mechanics: string[];
  structures: string[];
  platforms: string[];
  statuses: GameStatus[];
  desires: Desire[];
  counts: {
    total: number;
    completed: number;
    playing: number;
    pending: number;
  };
}

/** Preço atual de um app na loja da Steam (centavos da moeda; BRL para o Brasil). */
export interface SteamPrice {
  currency: string | null;
  initialCents: number | null;
  /** null = sem preço à venda (lançamento futuro, fora da loja). */
  finalCents: number | null;
  discountPercent: number;
  /** Fim da promoção atual (ISO), quando houver. */
  discountEndsAt: string | null;
  isFree: boolean;
  formatted: string | null;
  fetchedAt: string;
}
/** Resultado da busca por nome na loja. */
export interface SteamSearchItem {
  appId: number;
  name: string;
  imageUrl: string | null;
  price: SteamPrice | null;
}
/** Detalhes de um app da Steam usados para cadastrar o jogo. */
export interface SteamApp {
  appId: number;
  name: string;
  shortDescription: string;
  /** Tags da comunidade em pt-BR, da mais votada para a menos votada. */
  tags: string[];
  developers: string[];
  publishers: string[];
  releaseDate: string | null;
  headerUrl: string | null;
  capsuleUrl: string | null;
  heroUrl: string | null;
  storeUrl: string;
  price: SteamPrice | null;
}
export interface WishlistItem {
  game: ScoredGame;
  price: SteamPrice | null;
  description: string | null;
}
export interface WishlistImportResult {
  /** Itens na lista de desejos da Steam. */
  total: number;
  created: number;
  /** Já estavam no app (em qualquer status). */
  existing: number;
  failed: { appId: number; reason: string }[];
}
