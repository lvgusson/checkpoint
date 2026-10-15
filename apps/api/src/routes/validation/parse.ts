// Helper de validação Zod que lança AppError do projeto (RFC 9457).
import type { ZodType } from 'zod';
import { AppError } from '../../shared/errors.ts';

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
    throw new AppError(`${path}${issue.message}`, 400);
  }
  return result.data;
}
