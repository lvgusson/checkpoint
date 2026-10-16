// Ports: what the services need from persistence. Each interface is implemented by a
// repository in `repositories/` on top of a driver (see `drivers/types.ts`).
import type {
  Game,
  GameList,
  ManualAdjustment,
  ManualMove,
  ScoringConfig,
  SteamApp,
  SteamPrice,
} from '../../../../packages/core/src/models.ts';
import type { MetadataCatalog, MetadataCategory } from '../../../../packages/core/src/metadata.ts';
import type { ManualPin } from '../domain/scoring.ts';
import type { DeployInput, Environment, NewRelease, Release } from '../domain/releases.ts';
import type { GameBrowseQuery, GameBrowseResult } from './drivers/types.ts';

export interface GameRepository {
  list(): Promise<Game[]>;
  searchByName(query: string, excludeId?: string): Promise<Game[]>;
  get(id: string): Promise<Game | undefined>;
  /** `creator`: the caller just created the shared game row and may fill its catalog fields. */
  save(game: Game, options?: { creator?: boolean }): Promise<void>;
  metadataCatalog(): Promise<MetadataCatalog>;
  browse(query: GameBrowseQuery): Promise<GameBrowseResult>;
}

/**
 * Listas do usuário (só o nome é da lista; todos os jogos aparecem em todas).
 * `list()` garante ao menos uma lista e devolve a mais antiga primeiro (= lista padrão).
 */
export interface ListRepository {
  list(): Promise<GameList[]>;
  get(id: string): Promise<GameList | undefined>;
  /** Lança AppError 409 se já existir uma lista com o mesmo nome (sem diferenciar maiúsculas). */
  create(name: string): Promise<GameList>;
  rename(id: string, name: string): Promise<GameList | undefined>;
  /** 'last' = não apaga a única lista do usuário. */
  remove(id: string): Promise<'removed' | 'missing' | 'last'>;
}

/**
 * Posições fixadas na fila (pins) e histórico de movimentos, POR LISTA. Fica separado de
 * `GameRepository` para que o registro importado do jogo não seja alterado.
 */
export interface ManualAdjustmentRepository {
  /** Pins da lista, do mais antigo ao mais recente (o mais recente vence empates). */
  list(listId: string): Promise<ManualAdjustment[]>;
  /**
   * Grava os pins e o movimento que os originou, juntos. Idempotente por `move.id`:
   * repetir a mesma gravação (retentativa) não aplica duas vezes.
   */
  pin(listId: string, pins: ManualPin[], move: ManualMove): Promise<void>;
  /** Remove o pin do jogo registrando o reset. false se não havia pin. */
  remove(listId: string, gameId: string, move: ManualMove): Promise<boolean>;
  moves(listId: string, gameId?: string): Promise<ManualMove[]>;
}

/** Configuração do algoritmo de uma lista + versão (sobe a cada gravação; 0 = padrão). */
export interface StoredScoringConfig {
  config: ScoringConfig;
  version: number;
  updatedAt: string | null;
}

export interface ScoringConfigRepository {
  get(listId: string): Promise<StoredScoringConfig>;
  /** Grava (já validada) e devolve o registro novo, com a versão incrementada. */
  save(listId: string, config: ScoringConfig): Promise<StoredScoringConfig>;
}

/** Entradas do algoritmo da fila de uma lista. */
export interface QueueInputs {
  list: GameList;
  games: Game[];
  /** Posições fixadas pelo usuário na lista, do pin mais antigo ao mais recente. */
  pins: ManualPin[];
  settings: StoredScoringConfig;
}

/**
 * Lê todas as entradas da fila de uma vez (opcional). Com banco remoto, uma única
 * consulta em vez de quatro; a fila é calculada em memória (~50 ms para ~500 jogos).
 */
export interface QueueInputsReader {
  /**
   * `listId` ausente = lista padrão (a mais antiga). null se a lista não existir/não for do
   * usuário (ou, sem `listId`, se o usuário ainda não tiver listas).
   */
  load(listId?: string): Promise<QueueInputs | null>;
}

export interface CreateResult {
  id: string;
  /** false = o usuário já tinha o jogo (mesmo appid ou mesmo nome), nada foi criado. */
  created: boolean;
}

export interface WishlistStore {
  /** Cadastra o jogo na biblioteca do usuário (idempotente por appid ou nome). */
  create(game: Game, app: SteamApp | null): Promise<CreateResult>;
  /** Último preço conhecido por appid. */
  prices(appIds: number[]): Promise<Map<number, SteamPrice>>;
  savePrices(prices: Map<number, SteamPrice>): Promise<void>;
  /** Descrição curta da loja por id do jogo. */
  descriptions(gameIds: string[]): Promise<Map<string, string>>;
}

export type AppUserResolver = () => Promise<string>;

export interface ReleaseStore {
  list(environment: Environment, limit: number, beforeId: number | null): Promise<Release[]>;
  latest(environment: Environment): Promise<Release | null>;
  /** Find exact commit registration; exclude rollback unless requested. */
  bySha(
    environment: Environment,
    gitSha: string,
    includeRollback?: boolean,
  ): Promise<Release | null>;
  /** Insert registration; version conflicts require allocation retry. */
  insert(row: NewRelease): Promise<Release>;
  recordDeploy(releaseId: number, deploy: DeployInput): Promise<void>;
  /** The registration of a deployment (by id) or of a commit in an environment. */
  deployed(
    deploymentId: string | null,
    gitSha: string | null,
    environment: string,
  ): Promise<{
    version: string;
    name: string | null;
    description: string;
    gitSha: string;
    environment: string;
    deployedAt: string;
  } | null>;
}

export interface ConfigRepository {
  list(): Promise<MetadataCatalog>;
  add(category: MetadataCategory, name: string): Promise<void>;
  remove(category: MetadataCategory, name: string): Promise<void>;
}
