import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ManualAdjustment, ManualMove } from '../../shared/models.ts';
import type { ManualPin } from './scoring.ts';

/**
 * Posições fixadas na fila (pins) e histórico de movimentos. Fica separado de
 * `GameRepository` para que o registro importado do jogo não seja alterado.
 * SQL: queue_manual_adjustment (manual_position) e queue_move_event.
 */
export interface ManualAdjustmentRepository {
  /** Pins do mais antigo ao mais recente (o mais recente vence empates). */
  list(): Promise<ManualAdjustment[]>;
  /**
   * Grava os pins e o movimento que os originou, juntos. Idempotente por `move.id`:
   * repetir a mesma gravação (retentativa) não aplica duas vezes.
   */
  pin(pins: ManualPin[], move: ManualMove): Promise<void>;
  /** Remove o pin do jogo registrando o reset. false se não havia pin. */
  remove(gameId: string, move: ManualMove): Promise<boolean>;
  moves(gameId?: string): Promise<ManualMove[]>;
}

export const toPins = (adjustments: ManualAdjustment[]): ManualPin[] =>
  adjustments.map((a) => ({ gameId: a.gameId, position: a.manualPosition }));

interface ManualFile {
  adjustments: ManualAdjustment[];
  moves: ManualMove[];
}

/** Adaptador local em JSON. Sem `path`, mantém tudo só em memória. */
export class LocalManualAdjustmentRepository implements ManualAdjustmentRepository {
  /** Ordem de inserção = recência (um jogo movido de novo vai para o fim). */
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
      // Arquivos antigos (pontos manuais) sem posição são ignorados.
      for (const a of data.adjustments ?? [])
        if (a && typeof a.gameId === 'string' && Number.isInteger(a.manualPosition))
          this.adjustments.set(a.gameId, {
            gameId: a.gameId,
            manualPosition: a.manualPosition,
            updatedAt: a.updatedAt,
          });
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
  async pin(pins: ManualPin[], move: ManualMove) {
    await this.ready;
    if (this.history.some((m) => m.id === move.id)) return;
    for (const p of pins) {
      const old = this.adjustments.get(p.gameId);
      const next = { gameId: p.gameId, manualPosition: p.position, updatedAt: move.createdAt };
      // Só o jogo movido ganha recência; os demais só têm o índice corrigido.
      if (p.gameId === move.gameId || !old) {
        this.adjustments.delete(p.gameId);
        this.adjustments.set(p.gameId, next);
      } else old.manualPosition = p.position;
    }
    this.history.push(structuredClone(move));
    await this.persist();
  }
  async remove(gameId: string, move: ManualMove) {
    await this.ready;
    if (!this.adjustments.delete(gameId)) return false;
    this.history.push(structuredClone(move));
    await this.persist();
    return true;
  }
  async moves(gameId?: string) {
    await this.ready;
    return structuredClone(gameId ? this.history.filter((m) => m.gameId === gameId) : this.history);
  }
}
