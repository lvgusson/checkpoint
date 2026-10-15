// JSON local: sem tabela de contas; a identidade autenticada é o próprio dono dos dados.
// O modo local tem um só conjunto de dados, então o dono não filtra nada.
import type { AppUserDriver } from '../types.ts';

export class JsonAppUserDriver implements AppUserDriver {
  async findByAuthId(authId: string) {
    return authId;
  }
  async claimSeed() {
    return undefined;
  }
  async create(authId: string) {
    return authId;
  }
}
