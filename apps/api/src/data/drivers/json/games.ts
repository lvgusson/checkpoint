// JSON local: jogos. O seed vem embutido; os jogos cadastrados no app (lista de desejos) e as
// edições ficam no arquivo e sobrepõem o seed. Um só usuário: `owner` é ignorado.
import { Desire, type Game } from '../../../../../../packages/core/src/models.ts';
import { normalizeText } from '../../../domain/text.ts';
import type { GamesDriver, GameBrowseQuery, GameBrowseResult } from '../types.ts';
import { JsonFile } from './file.ts';

const DESIRE_ORDER: Record<string, number> = {
  [Desire.Immediate]: 0,
  immediate: 0,
  [Desire.VeryHigh]: 1,
  very_high: 1,
  [Desire.High]: 2,
  high: 2,
  [Desire.Medium]: 3,
  medium: 3,
  [Desire.Low]: 4,
  low: 4,
  [Desire.VeryLow]: 5,
  very_low: 5,
};

const STATUS_ALIASES: Record<string, string> = {
  not_started: 'Não iniciado',
  playing: 'Jogando',
  abandoned: 'Abandonado',
  finished: 'Finalizado',
  wishlist: 'Desejado',
};

export class JsonGamesDriver implements GamesDriver {
  private games: Map<string, Game>;
  private file: JsonFile;
  private ready: Promise<void>;
  constructor(seed: Game[], path: string | null) {
    this.games = new Map(structuredClone(seed).map((g) => [g.id, g]));
    this.file = new JsonFile(path);
    this.ready = this.load();
  }
  private async load() {
    const data = (await this.file.read()) as Game[] | undefined;
    // Jogos fora do seed são os cadastrados no app (lista de desejos).
    for (const g of data ?? []) this.games.set(g.id, g);
  }
  async list(_owner: string) {
    await this.ready;
    return structuredClone([...this.games.values()]);
  }
  async browse(_owner: string, query: GameBrowseQuery): Promise<GameBrowseResult> {
    await this.ready;
    let games = structuredClone([...this.games.values()]);

    if (query.q) {
      const wanted = normalizeText(query.q);
      games = games.filter((g) =>
        normalizeText(g.name + ' ' + g.secondaryTags.join(' ')).includes(wanted),
      );
    }
    if (query.status) {
      const targetStatus = STATUS_ALIASES[query.status] ?? query.status;
      games = games.filter((g) => g.status === targetStatus || g.status === query.status);
    }
    if (query.primaryGenre) {
      games = games.filter((g) => g.primaryGenre === query.primaryGenre);
    }
    if (query.store) {
      games = games.filter((g) => g.store === query.store);
    }

    if (query.sort === 'desire') {
      games.sort((a, b) => {
        const orderA = DESIRE_ORDER[a.desire] ?? 99;
        const orderB = DESIRE_ORDER[b.desire] ?? 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'pt-BR');
      });
    } else {
      games.sort((a, b) => {
        const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'pt-BR');
        if (nameCmp !== 0) return nameCmp;
        return a.id.localeCompare(b.id);
      });
    }

    const total = games.length;
    const page = Math.max(1, query.page);
    const pageSize = Math.max(1, query.pageSize);
    const items = games.slice((page - 1) * pageSize, page * pageSize);

    return { items, total };
  }
  async get(_owner: string, id: string) {
    await this.ready;
    return structuredClone(this.games.get(id));
  }
  async searchByName(owner: string, query: string, excludeId?: string) {
    const wanted = normalizeText(query);
    return (await this.list(owner))
      .filter((g) => g.id !== excludeId && normalizeText(g.name).includes(wanted))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 12);
  }
  /** Sem tabelas de vocabulário: o repositório monta o catálogo a partir dos jogos. */
  async catalog() {
    return null;
  }
  async save(_owner: string, game: Game) {
    await this.ready;
    this.games.set(game.id, structuredClone(game));
    await this.file.write([...this.games.values()]);
  }
}
