import { Injectable } from '@angular/core';
import type { ScoredGame } from '../../shared/models';

/**
 * STUB (contrato do modal de finalizar). A implementação real (nota 1–5, horas jogadas,
 * avaliação em texto; data de finalização = hoje) vem da branch feat/finish-modal.
 */
@Injectable({ providedIn: 'root' })
export class FinishDialog {
  /** Abre o modal; true se salvou. */
  open(
    game: Pick<ScoredGame, 'id' | 'name' | 'actualHours' | 'rating' | 'notes'>,
  ): Promise<boolean> {
    void game;
    return Promise.resolve(false);
  }
}
