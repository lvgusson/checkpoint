// JSON local: pins da fila e histórico de movimentos, por lista. Um só usuário: `owner` é
// ignorado. Itens sem lista (arquivos antigos) pertencem à lista padrão.
import type { ManualAdjustment, ManualMove } from '../../../../../../packages/core/src/models.ts';
import type { PinsDriver } from '../types.ts';
import { JsonFile } from './file.ts';
import { LOCAL_DEFAULT_LIST_ID } from './lists.ts';

type Stored<T> = T & { listId?: string };
interface ManualFile {
  adjustments: Stored<ManualAdjustment>[];
  moves: Stored<ManualMove>[];
}

export class JsonPinsDriver implements PinsDriver {
  /** chave `${listId}\n${gameId}`; ordem de inserção = recência (movido de novo vai para o fim). */
  private adjustments = new Map<string, Stored<ManualAdjustment>>();
  private history: Stored<ManualMove>[] = [];
  private file: JsonFile;
  private ready: Promise<void>;
  private maxMoves: number;
  constructor(path: string | null, maxMoves = 5000) {
    this.file = new JsonFile(path);
    this.maxMoves = maxMoves;
    this.ready = this.load();
  }
  private static key(listId: string, gameId: string) {
    return listId + '\n' + gameId;
  }
  private async load() {
    const data = (await this.file.read()) as Partial<ManualFile> | undefined;
    if (!data) return;
    // Arquivos antigos (pontos manuais) sem posição são ignorados.
    for (const a of data.adjustments ?? [])
      if (a && typeof a.gameId === 'string' && Number.isInteger(a.manualPosition)) {
        const listId = a.listId ?? LOCAL_DEFAULT_LIST_ID;
        this.adjustments.set(JsonPinsDriver.key(listId, a.gameId), {
          gameId: a.gameId,
          manualPosition: a.manualPosition,
          updatedAt: a.updatedAt,
          listId,
        });
      }
    this.history = Array.isArray(data.moves)
      ? data.moves.map((m) => ({ ...m, listId: m.listId ?? LOCAL_DEFAULT_LIST_ID }))
      : [];
  }
  private async persist() {
    if (this.history.length > this.maxMoves) this.history = this.history.slice(-this.maxMoves);
    await this.file.write({
      adjustments: [...this.adjustments.values()],
      moves: this.history,
    } satisfies ManualFile);
  }
  private static strip<T>({ listId: _listId, ...rest }: Stored<T>): T {
    return structuredClone(rest) as T;
  }
  async list(_owner: string, listId: string) {
    await this.ready;
    return [...this.adjustments.values()]
      .filter((a) => a.listId === listId)
      .map((a) => JsonPinsDriver.strip(a));
  }
  async pin(
    _owner: string,
    listId: string,
    pins: { gameId: string; position: number }[],
    move: ManualMove,
  ) {
    await this.ready;
    if (this.history.some((m) => m.id === move.id)) return;
    for (const p of pins) {
      const key = JsonPinsDriver.key(listId, p.gameId);
      const old = this.adjustments.get(key);
      const next = {
        gameId: p.gameId,
        manualPosition: p.position,
        updatedAt: move.createdAt,
        listId,
      };
      // Só o jogo movido ganha recência; os demais só têm o índice corrigido.
      if (p.gameId === move.gameId || !old) {
        this.adjustments.delete(key);
        this.adjustments.set(key, next);
      } else old.manualPosition = p.position;
    }
    this.history.push({ ...structuredClone(move), listId });
    await this.persist();
  }
  async remove(_owner: string, listId: string, gameId: string, move: ManualMove) {
    await this.ready;
    if (!this.adjustments.delete(JsonPinsDriver.key(listId, gameId))) return false;
    this.history.push({ ...structuredClone(move), listId });
    await this.persist();
    return true;
  }
  async moves(_owner: string, listId: string, gameId?: string) {
    await this.ready;
    return this.history
      .filter((m) => m.listId === listId && (!gameId || m.gameId === gameId))
      .map((m) => JsonPinsDriver.strip(m));
  }
}
