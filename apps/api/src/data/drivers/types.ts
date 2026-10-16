// Driver contracts: persistence operations in domain-record terms, one interface per entity.
//
// A driver only stores and fetches. It holds no business rule, no permission check and never
// throws AppError: constraint failures surface as DataError and the repository on top of it
// maps them. Every method that touches user data takes the `owner` id first and must filter by
// it; a record that belongs to someone else behaves as if it did not exist.
//
// To add a database: implement the interfaces you need in `drivers/<name>/` and select it in
// `data/index.ts`. Nothing outside `drivers/pg` may contain SQL.
import type {
  Game,
  GameList,
  ManualAdjustment,
  ManualMove,
  ScoringConfig,
  SteamApp,
  SteamPrice,
} from '../../../../../packages/core/src/models.ts';
import type {
  MetadataCatalog,
  MetadataCategory,
} from '../../../../../packages/core/src/metadata.ts';
import type { Release, DeployInput, Environment, NewRelease } from '../../domain/releases.ts';

/** Neutral storage failure; repositories translate it to the error their callers expect. */
type DataErrorCode = 'invalid' | 'not_found' | 'conflict';
export class DataError extends Error {
  code: DataErrorCode;
  /** Name of the violated constraint, when the store reports one. */
  constraint?: string;
  constructor(code: DataErrorCode, message = code, constraint?: string) {
    super(message);
    this.code = code;
    this.constraint = constraint;
  }
}

/** Nome da lista criada automaticamente no primeiro acesso. */
export const DEFAULT_LIST_NAME = 'Principal';

export interface GameBrowseQuery {
  q?: string;
  status?: string;
  primaryGenre?: string;
  store?: string;
  sort: 'name' | 'desire';
  page: number;
  pageSize: number;
}

export interface GameBrowseResult {
  items: Game[];
  total: number;
}

export interface GamesDriver {
  list(owner: string): Promise<Game[]>;
  get(owner: string, id: string): Promise<Game | undefined>;
  /** At most 12 games of the owner whose name contains `query`, by name. */
  searchByName(owner: string, query: string, excludeId?: string): Promise<Game[]>;
  /** The controlled vocabulary kept by the store, or null when it keeps none. */
  catalog(): Promise<MetadataCatalog | null>;
  /** `writeCatalog`: the caller may change the fields shared by every library. */
  save(owner: string, game: Game, options: { writeCatalog: boolean }): Promise<void>;
  browse(owner: string, query: GameBrowseQuery): Promise<GameBrowseResult>;
}

export interface ListsDriver {
  /** The owner's lists, oldest first. May be empty. */
  list(owner: string): Promise<GameList[]>;
  get(owner: string, id: string): Promise<GameList | undefined>;
  /** Throws DataError('conflict') when the owner already has a list with that name. */
  create(owner: string, name: string): Promise<GameList>;
  /** Throws DataError('conflict') on a repeated name; undefined when the list is not the owner's. */
  rename(owner: string, id: string, name: string): Promise<GameList | undefined>;
  /** Atomic: 'last' means the owner's only list was kept. */
  remove(owner: string, id: string): Promise<'removed' | 'missing' | 'last'>;
}

export interface PinsDriver {
  list(owner: string, listId: string): Promise<ManualAdjustment[]>;
  pin(
    owner: string,
    listId: string,
    pins: { gameId: string; position: number }[],
    move: ManualMove,
  ): Promise<void>;
  remove(owner: string, listId: string, gameId: string, move: ManualMove): Promise<boolean>;
  moves(owner: string, listId: string, gameId?: string): Promise<ManualMove[]>;
}

/** Scoring configuration as stored; the repository turns it into a validated config. */
export interface ScoringRecord {
  weights: unknown;
  rules: unknown;
  filters: unknown;
  version: number;
  updatedAt: string | null;
}
export interface ScoringDriver {
  /** undefined: nothing saved yet for that list. */
  get(owner: string, listId: string): Promise<ScoringRecord | undefined>;
  /** Saves with the version incremented; undefined when the list is not the owner's. */
  save(owner: string, listId: string, config: ScoringConfig): Promise<ScoringRecord | undefined>;
}

/** Everything the queue needs, read in one go. */
export interface QueueInputsRecord {
  list: GameList;
  games: Game[];
  pins: { gameId: string; position: number }[];
  settings: ScoringRecord | null;
}
export interface QueueInputsDriver {
  /** `listId` absent: the owner's oldest list. null: no such list for the owner. */
  load(owner: string, listId?: string): Promise<QueueInputsRecord | null>;
}

export interface WishlistDriver {
  /**
   * Adds the game to the owner's library as a wishlist entry, once per Steam app (or name when
   * there is no app id). `catalogCreated`: the shared catalog row is new and its work fields
   * still have to be saved through the games repository.
   */
  create(
    owner: string,
    game: Game,
    app: SteamApp | null,
  ): Promise<{ id: string; created: boolean; catalogCreated: boolean }>;
  prices(appIds: number[]): Promise<Map<number, SteamPrice>>;
  savePrices(prices: Map<number, SteamPrice>): Promise<void>;
  descriptions(gameIds: string[]): Promise<Map<string, string>>;
}

export interface ReleaseDriver {
  list(environment: Environment, limit: number, beforeId: number | null): Promise<Release[]>;
  bySha(
    environment: Environment,
    gitSha: string,
    includeRollback: boolean,
  ): Promise<Release | null>;
  /** Throws DataError('conflict', constraint) on a repeated version or commit. */
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

export interface AppUserDriver {
  findByAuthId(authId: string): Promise<string | undefined>;
  /** Links the seed account to `authId` when it is still unclaimed and the e-mail matches. */
  claimSeed(
    seedId: string,
    authId: string,
    email: string,
    seedOwnerEmail: string,
  ): Promise<string | undefined>;
  /** Creates the account; undefined when the id belongs to another identity. */
  create(authId: string, email: string | null): Promise<string | undefined>;
}

export interface ConfigDriver {
  list(): Promise<MetadataCatalog>;
  add(category: MetadataCategory, name: string): Promise<void>;
  remove(category: MetadataCategory, name: string): Promise<'removed' | 'missing' | 'used'>;
}

export interface TrackEventRecord {
  kind: 'page_view' | 'click';
  screen: string;
  element?: string | null;
  occurredAt: Date;
}

export interface TrackBatchRecord {
  userId: string;
  sessionId: string;
  automated: boolean;
  events: TrackEventRecord[];
}

export interface TrackDriver {
  recordBatch(batch: TrackBatchRecord): Promise<void>;
}
