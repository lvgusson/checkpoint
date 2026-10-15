// JSON local: jogos. O seed vem embutido; os jogos cadastrados no app (lista de desejos) e as
// edições ficam no arquivo e sobrepõem o seed. Um só usuário: `owner` é ignorado.
import type { Game } from '../../../../../../packages/core/src/models.ts';
import { normalizeText } from '../../../domain/text.ts';
import type { GamesDriver } from '../types.ts';
import { JsonFile } from './file.ts';

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
