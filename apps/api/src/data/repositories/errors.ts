// Translation of neutral driver failures into the errors the HTTP layer understands.
import { AppError } from '../../shared/errors.ts';
import { DataError } from '../drivers/types.ts';

/** Out-of-range values answer 400 and a missing or foreign record answers 404; the rest passes. */
export function toAppError(e: unknown): never {
  if (e instanceof DataError) {
    if (e.code === 'invalid') throw new AppError('Valor inválido');
    if (e.code === 'not_found') throw new AppError('Registro não encontrado', 404);
  }
  throw e;
}
