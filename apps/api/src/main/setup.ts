// Monta os serviços sobre a camada de dados (ver data/index.ts para escolher o driver de cada
// entidade: GAMES_STORE, LISTS_STORE, ... = pg | json; padrão pg com DATABASE_URL, senão json).
import { createData } from './data.ts';
import { GameService } from '../services/games.ts';
import { WishlistService } from '../services/wishlist.ts';
import { ConfigService } from '../services/config.ts';
import {
  steamClientFromEnv,
  steamProfileFromEnv,
  type SteamClient,
} from '../integrations/steam/client.ts';

import { TrackService } from '../services/track.ts';

type Env = Record<string, string | undefined>;

export interface ServiceOptions {
  env?: Env;
  /** Diretório dos JSON locais (usado pelas entidades em modo json). */
  dataDir: string;
  /** app_user usado quando a autenticação está desligada (somente dev). */
  devAppUserId?: string;
  /** Cliente da Steam (padrão: das variáveis de ambiente). O seed usa um snapshot local. */
  steam?: SteamClient;
}

export async function createService({
  env = process.env,
  dataDir,
  devAppUserId,
  steam = steamClientFromEnv(env),
}: ServiceOptions): Promise<{
  service: GameService;
  wishlist: WishlistService;
  config: ConfigService;
  track: TrackService | null;
  storage: 'postgres' | 'json' | 'mixed';
}> {
  const data = await createData({ env, dataDir, devAppUserId });
  const service = new GameService(data.games, data.manual, data.queue, data.scoring, data.lists);
  return {
    storage: data.storage,
    service,
    wishlist: new WishlistService(service, data.wishlist, steam, {
      defaultProfile: steamProfileFromEnv(env),
    }),
    config: new ConfigService(data.config),
    track: data.track ? new TrackService(data.track) : null,
  };
}
