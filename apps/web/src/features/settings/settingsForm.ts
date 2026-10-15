import { z } from 'zod';
import type {
  FilterOption,
  ScoringConfig,
  ScoringFactor,
  ScoringSection,
} from '../../../../../packages/core/src/models';

export const SECTIONS: { id: ScoringSection; title: string; hint: string }[] = [
  {
    id: 'base',
    title: 'Score base',
    hint: 'Pontuação própria de cada jogo, antes de olhar a ordem.',
  },
  {
    id: 'context',
    title: 'Ajustes contextuais',
    hint: 'Somados ao comparar o candidato com os jogos anteriores da fila (ou os últimos finalizados).',
  },
  {
    id: 'filter',
    title: 'Filtros e elegibilidade',
    hint: 'Quem entra na fila. Desligar um filtro inclui esses jogos.',
  },
  { id: 'manual', title: 'Ajuste manual', hint: 'Posições fixadas ao arrastar jogos na fila.' },
  {
    id: 'params',
    title: 'Parâmetros',
    hint: 'Limites usados pelas regras acima. Valem enquanto alguma regra que os usa estiver ativa.',
  },
];

/** Adjustments that add (the others subtract); tag ones are multiplied by the overlap. */
export const BONUS = new Set<string>(['contrastingPace', 'shortAfterLong']);
export const OVERLAP = new Set<string>(['repeatTag', 'repeatTagTwoBack']);

const hours = z.number().min(0).max(10000).nullable();

/**
 * Validation of the edited config. Weight ranges come from the server's factor rows. Only used for
 * errors: submit reads the form values, so keys this schema does not know are never dropped.
 */
export const scoringSchema = (factors: ScoringFactor[]) =>
  z.object({
    weights: z.object(
      Object.fromEntries(
        factors.filter((f) => f.weight).map((f) => [f.weight!, z.number().min(f.min).max(f.max)]),
      ),
    ),
    filters: z
      .object({ minHours: hours, maxHours: hours })
      .refine((f) => f.minHours === null || f.maxHours === null || f.minHours <= f.maxHours, {
        path: ['maxHours'],
      }),
  });

export const num = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '?';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const hasValue = (list: string[], value: string) => {
  const v = value.toLocaleLowerCase('pt-BR');
  return list.some((x) => x.toLocaleLowerCase('pt-BR') === v);
};

/** How many candidates the hour limits remove (unknown time passes unless asked otherwise). */
export function hoursRemoved({ filters: f }: ScoringConfig, hoursList: (number | null)[]) {
  return hoursList.filter((h) =>
    h === null
      ? f.excludeUnknownHours
      : (f.minHours !== null && h < f.minHours) || (f.maxHours !== null && h > f.maxHours),
  ).length;
}

export function desireRemoved({ filters: f }: ScoringConfig, desires: FilterOption[]) {
  const min = desires.findIndex((x) => x.value === f.minDesire);
  return min < 0 ? 0 : desires.slice(min + 1).reduce((s, x) => s + x.count, 0);
}

export function queueRule({ rules: r }: ScoringConfig) {
  const statuses = ['Não iniciado', ...(r.excludeAbandoned ? [] : ['Abandonado'])];
  const extra = [
    r.excludeEndless && 'exceto os sem fim definido',
    r.excludeCompetitive && 'exceto competitivos/online',
    r.prerequisites && 'respeitando a ordem da série',
  ].filter(Boolean);
  return `Entram na fila: ${statuses.join(', ')}${extra.length ? ', ' + extra.join(', ') : ''}. Jogos em andamento aparecem em Jogando agora.`;
}
