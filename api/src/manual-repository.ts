import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ManualAdjustment, ManualMove } from '../../shared/models.ts';

/**
 * Ajustes manuais da fila (pontos flat por jogo) e histórico de movimentos.
 * Fica separado de `GameRepository` para que o registro importado do jogo não
 * seja alterado. Um adaptador SQL pode implementar esta interface com duas
 * tabelas: ajustes (game_id, manual_points, manual_position, updated_at) e
 * movimentos (game_id, kind, from_position, to_position, effective_position,
 * points_delta, manual_points_after, created_at).
 */
export interface ManualAdjustmentRepository {
  list(): Promise<ManualAdjustment[]>;
  get(gameId: string): Promise<ManualAdjustment | undefined>;
  /** Grava o ajuste e o movimento que o originou, juntos. */
  save(adjustment: ManualAdjustment, move: ManualMove): Promise<void>;
  /** Remove o ajuste (volta a 0) registrando o movimento de reset. */
  remove(gameId: string, move: ManualMove): Promise<void>;
  moves(gameId?: string): Promise<ManualMove[]>;
}

interface ManualFile {
  adjustments: ManualAdjustment[];
  moves: ManualMove[];
}

/** Adaptador local em JSON. Sem `path`, mantém tudo só em memória. */
export class LocalManualAdjustmentRepository implements ManualAdjustmentRepository {
  private adjustments = new Map<string, ManualAdjustment>();
  private history: ManualMove[] = [];
  private ready: Promise<void>;
  private writing = Promise.resolve();
  private path: string | null;
  private maxMoves: number;
  constructor(path: string | null = null, maxMoves = 5000) {
    this.path = path;
    this.maxMoves = maxMoves;
    this.ready = this.load();
  }
  private async load() {
    if (!this.path) return;
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8')) as Partial<ManualFile>;
      for (const a of data.adjustments ?? [])
        if (a && typeof a.gameId === 'string' && Number.isFinite(a.manualPoints))
          this.adjustments.set(a.gameId, a);
      this.history = Array.isArray(data.moves) ? data.moves : [];
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
  async list() {
    await this.ready;
    return structuredClone([...this.adjustments.values()]);
  }
  async get(gameId: string) {
    await this.ready;
    return structuredClone(this.adjustments.get(gameId));
  }
  async save(adjustment: ManualAdjustment, move: ManualMove) {
    await this.ready;
    this.adjustments.set(adjustment.gameId, structuredClone(adjustment));
    this.history.push(structuredClone(move));
    await this.persist();
  }
  async remove(gameId: string, move: ManualMove) {
    await this.ready;
    this.adjustments.delete(gameId);
    this.history.push(structuredClone(move));
    await this.persist();
  }
  async moves(gameId?: string) {
    await this.ready;
    return structuredClone(gameId ? this.history.filter((m) => m.gameId === gameId) : this.history);
  }
}
