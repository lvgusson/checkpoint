import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ManualAdjustment, ManualMove } from '../../shared/models.ts';
import type { ManualPin } from './scoring.ts';
import { LOCAL_DEFAULT_LIST_ID } from './list-repository.ts';

/**
 * Posições fixadas na fila (pins) e histórico de movimentos, POR LISTA. Fica separado de
 * `GameRepository` para que o registro importado do jogo não seja alterado.
 * SQL: queue_manual_adjustment (list_id, game_id, manual_position) e queue_move_event.
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

export const toPins = (adjustments: ManualAdjustment[]): ManualPin[] =>
  adjustments.map((a) => ({ gameId: a.gameId, position: a.manualPosition }));

type Stored<T> = T & { listId?: string };
interface ManualFile {
  adjustments: Stored<ManualAdjustment>[];
  moves: Stored<ManualMove>[];
}

/** Adaptador local em JSON. Sem `path`, mantém tudo só em memória. Itens sem lista = lista padrão. */
export class LocalManualAdjustmentRepository implements ManualAdjustmentRepository {
  /** chave `${listId}\n${gameId}`; ordem de inserção = recência (movido de novo vai para o fim). */
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
      // Arquivos antigos (pontos manuais) sem posição são ignorados.
      for (const a of data.adjustments ?? [])
        if (a && typeof a.gameId === 'string' && Number.isInteger(a.manualPosition)) {
          const listId = a.listId ?? LOCAL_DEFAULT_LIST_ID;
          this.adjustments.set(LocalManualAdjustmentRepository.key(listId, a.gameId), {
            gameId: a.gameId,
            manualPosition: a.manualPosition,
            updatedAt: a.updatedAt,
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
  async pin(listId: string, pins: ManualPin[], move: ManualMove) {
    await this.ready;
    if (this.history.some((m) => m.id === move.id)) return;
    for (const p of pins) {
      const key = LocalManualAdjustmentRepository.key(listId, p.gameId);
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
  async remove(listId: string, gameId: string, move: ManualMove) {
    await this.ready;
    if (!this.adjustments.delete(LocalManualAdjustmentRepository.key(listId, gameId))) return false;
    this.history.push({ ...structuredClone(move), listId });
    await this.persist();
    return true;
  }
  async moves(listId: string, gameId?: string) {
    await this.ready;
    return this.history
      .filter((m) => m.listId === listId && (!gameId || m.gameId === gameId))
      .map((m) => LocalManualAdjustmentRepository.strip(m));
  }
}
