import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ManualAdjustment, ManualMove } from '../../shared/models.ts';
import { LOCAL_DEFAULT_LIST_ID } from './list-repository.ts';

/**
 * Ajustes manuais da fila (pontos flat por jogo) e histórico de movimentos, POR LISTA.
 * Fica separado de `GameRepository` para que o registro importado do jogo não
 * seja alterado. No Postgres: queue_manual_adjustment (list_id, game_id, ...) e
 * queue_move_event (list_id, game_id, kind, ...).
 */
export interface ManualAdjustmentRepository {
  list(listId: string): Promise<ManualAdjustment[]>;
  get(listId: string, gameId: string): Promise<ManualAdjustment | undefined>;
  /** Grava o ajuste e o movimento que o originou, juntos. */
  save(listId: string, adjustment: ManualAdjustment, move: ManualMove): Promise<void>;
  /** Remove o ajuste (volta a 0) registrando o movimento de reset. */
  remove(listId: string, gameId: string, move: ManualMove): Promise<void>;
  moves(listId: string, gameId?: string): Promise<ManualMove[]>;
}

type Stored<T> = T & { listId?: string };
interface ManualFile {
  adjustments: Stored<ManualAdjustment>[];
  moves: Stored<ManualMove>[];
}

/** Adaptador local em JSON. Sem `path`, mantém tudo só em memória. Itens sem lista = lista padrão. */
export class LocalManualAdjustmentRepository implements ManualAdjustmentRepository {
  /** chave `${listId}\n${gameId}` */
  private adjustments = new Map<string, Stored<ManualAdjustment>>();
  private history: Stored<ManualMove>[] = [];
  private ready: Promise<void>;
  private writing = Promise.resolve();
  private path: string | null;
  private maxMoves: number;
  constructor(path: string | null = null, maxMoves = 5000) {
    this.path = path;
    this.maxMoves = maxMoves;
    this.ready = this.load();
  }
  private static key(listId: string, gameId: string) {
    return listId + '\n' + gameId;
  }
  private async load() {
    if (!this.path) return;
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8')) as Partial<ManualFile>;
      for (const a of data.adjustments ?? [])
        if (a && typeof a.gameId === 'string' && Number.isFinite(a.manualPoints)) {
          const listId = a.listId ?? LOCAL_DEFAULT_LIST_ID;
          this.adjustments.set(LocalManualAdjustmentRepository.key(listId, a.gameId), {
            ...a,
            listId,
          });
        }
      this.history = Array.isArray(data.moves)
        ? data.moves.map((m) => ({ ...m, listId: m.listId ?? LOCAL_DEFAULT_LIST_ID }))
        : [];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  private async persist() {
    if (this.history.length > this.maxMoves) this.history = this.history.slice(-this.maxMoves);
    if (!this.path) return;
    const path = this.path;
    const snapshot = JSON.stringify(
      {
        adjustments: [...this.adjustments.values()],
        moves: this.history,
      } satisfies ManualFile,
      null,
      2,
    );
    this.writing = this.writing
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + '.tmp', snapshot);
        await rename(path + '.tmp', path);
      });
    await this.writing;
  }
  private static strip<T>({ listId: _listId, ...rest }: Stored<T>): T {
    return structuredClone(rest) as T;
  }
  async list(listId: string) {
    await this.ready;
    return [...this.adjustments.values()]
      .filter((a) => a.listId === listId)
      .map((a) => LocalManualAdjustmentRepository.strip(a));
  }
  async get(listId: string, gameId: string) {
    await this.ready;
    const a = this.adjustments.get(LocalManualAdjustmentRepository.key(listId, gameId));
    return a && LocalManualAdjustmentRepository.strip(a);
  }
  async save(listId: string, adjustment: ManualAdjustment, move: ManualMove) {
    await this.ready;
    this.adjustments.set(LocalManualAdjustmentRepository.key(listId, adjustment.gameId), {
      ...structuredClone(adjustment),
      listId,
    });
    this.history.push({ ...structuredClone(move), listId });
    await this.persist();
  }
  async remove(listId: string, gameId: string, move: ManualMove) {
    await this.ready;
    this.adjustments.delete(LocalManualAdjustmentRepository.key(listId, gameId));
    this.history.push({ ...structuredClone(move), listId });
    await this.persist();
  }
  async moves(listId: string, gameId?: string) {
    await this.ready;
    return this.history
      .filter((m) => m.listId === listId && (!gameId || m.gameId === gameId))
      .map((m) => LocalManualAdjustmentRepository.strip(m));
  }
}
