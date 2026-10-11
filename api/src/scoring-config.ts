// Configuração do algoritmo por usuário: metadados da tela (fatores, faixas) e validação.
import type {
  ScoreWeights,
  ScoringConfig,
  ScoringFactor,
  ScoringRuleId,
} from '../../shared/models.ts';
import { defaultConfig, defaultRules, defaultWeights } from './scoring.ts';

type Row = Omit<ScoringFactor, 'id' | 'step'> & { step?: number };
const coef = { unit: '×', min: 0, max: 10, step: 0.01 };
const points = { unit: 'pts', min: -1000, max: 1000, step: 0.5 };
const hours = { unit: 'h', min: 0, max: 10000, step: 1 };
const rule = (
  section: ScoringFactor['section'],
  id: ScoringRuleId,
  label: string,
  description: string,
  weight: keyof ScoreWeights | null = id as keyof ScoreWeights,
  range = points,
): Row => ({ section, label, description, rule: id, weight, ...range });
const param = (weight: keyof ScoreWeights, label: string, description: string, range: object) =>
  ({ section: 'params', label, description, rule: null, weight, ...range }) as Row;

/** Linhas da tabela, na ordem de exibição. */
export const scoringFactors: ScoringFactor[] = [
  rule(
    'base',
    'desire',
    'Vontade de jogar (D)',
    'Imediata = Muito Alta = 100, Alta = 75, Média = 50, Baixa = 25, Muito Baixa = 0. Imediata vai ao topo da fila.',
    'desire',
    coef,
  ),
  rule(
    'base',
    'affinity',
    'Afinidade (A)',
    'Média bayesiana das suas notas (1–5 → 0–100) em jogos do mesmo gênero, ritmo e mecânica.',
    'affinity',
    coef,
  ),
  rule(
    'base',
    'duration',
    'Duração (T)',
    'Jogos curtos valem mais: 100 + folga − horas previstas (limitado a 0–100; sem tempo = 50).',
    'duration',
    coef,
  ),
  rule(
    'base',
    'timeFactor',
    'Seu ritmo (fator de tempo)',
    'Ajusta as horas previstas pela mediana real/estimado dos finalizados (0,5×–2×). Desligado = 1×.',
    null,
  ),
  rule(
    'context',
    'inProgress',
    'Concluir o que já começou',
    'Bônus para jogos com status Jogando.',
  ),
  rule(
    'context',
    'repeatGenre',
    'Gênero repetido',
    'Penalidade quando o gênero é igual ao do jogo anterior.',
  ),
  rule(
    'context',
    'repeatGenreTwoBack',
    'Gênero repetido há duas posições',
    'Penalidade quando o gênero é igual ao de dois jogos atrás.',
  ),
  rule(
    'context',
    'repeatMechanic',
    'Mesma mecânica',
    'Penalidade quando a mecânica é igual à do jogo anterior.',
  ),
  rule(
    'context',
    'repeatTag',
    'Subgêneros repetidos',
    'Penalidade × proporção de tags em comum com o jogo anterior.',
  ),
  rule(
    'context',
    'repeatTagTwoBack',
    'Subgêneros de duas posições atrás',
    'Penalidade × proporção de tags em comum com o jogo de duas posições atrás.',
  ),
  rule(
    'context',
    'consecutiveLong',
    'Duas campanhas longas seguidas',
    'Penalidade quando este e o anterior passam do limite de campanha longa.',
  ),
  rule(
    'context',
    'longAfterHeavy',
    'Campanha longa após carga recente alta',
    'Penalidade para campanha longa quando os 3 anteriores somam mais que a carga recente.',
  ),
  rule('context', 'repeatPace', 'Mesmo ritmo', 'Penalidade quando o ritmo repete o anterior.'),
  rule(
    'context',
    'contrastingPace',
    'Contraste de ritmo',
    'Bônus ao alternar entre Calmo e Frenético.',
  ),
  rule(
    'context',
    'shortAfterLong',
    'Respiro curto depois de um longo',
    'Bônus para jogo curto logo após uma campanha longa.',
  ),
  rule(
    'filter',
    'excludeEndless',
    'Excluir jogos sem fim definido',
    'Jogos com estrutura "Sem fim definido" ficam fora da fila.',
    null,
  ),
  rule(
    'filter',
    'excludeAbandoned',
    'Excluir abandonados',
    'Jogos com status Abandonado ficam fora da fila.',
    null,
  ),
  rule(
    'filter',
    'excludeCompetitive',
    'Excluir competitivos/online',
    'Fora da fila: gênero Luta, Esporte ou MMORPG, ou mecânica Esporte/Progressão online.',
    null,
  ),
  rule(
    'filter',
    'prerequisites',
    'Respeitar ordem da série',
    'Um jogo só entra depois do predecessor (pré-requisito) pendente.',
    null,
  ),
  rule(
    'manual',
    'manual',
    'Ajuste manual',
    'Posições fixadas ao arrastar jogos na fila. Desligado = ignora os fixos e bloqueia o arraste.',
    null,
  ),
  param('longHours', 'Limite de campanha longa', 'A partir de quantas horas é longa.', hours),
  param('shortHours', 'Limite de jogo curto', 'Até quantas horas conta como respiro.', hours),
  param('recentHours', 'Carga recente alta', 'Soma de horas dos 3 anteriores.', hours),
  param('freeDurationHours', 'Folga de duração', 'Horas "grátis" no fator de duração.', hours),
  param('priorStrength', 'Força do prior (k)', 'Peso da afinidade neutra contra suas notas.', {
    unit: 'jogos',
    min: 0.1,
    max: 100,
    step: 0.1,
  }),
  param('neutralAffinity', 'Afinidade neutra (prior)', 'Afinidade sem notas.', {
    unit: 'pts',
    min: 0,
    max: 100,
    step: 1,
  }),
].map((f) => ({ step: 1, ...f, id: f.rule ?? f.weight! }));

const ranges = new Map(scoringFactors.filter((f) => f.weight).map((f) => [f.weight!, f]));
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Valida a configuração enviada pelo usuário. Chaves ausentes ficam com o padrão
 * (permite clientes antigos); chaves desconhecidas ou valores fora da faixa → RangeError.
 */
export function parseScoringConfig(input: unknown): ScoringConfig {
  if (!isObject(input) || !isObject(input.weights) || !isObject(input.rules))
    throw new RangeError('Envie { weights, rules }');
  const weights = { ...defaultWeights };
  for (const [key, value] of Object.entries(input.weights)) {
    const f = ranges.get(key as keyof ScoreWeights);
    if (!f) throw new RangeError('Peso desconhecido: ' + key);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < f.min || value > f.max)
      throw new RangeError(`${f.label}: use um número entre ${f.min} e ${f.max}`);
    weights[key as keyof ScoreWeights] = value;
  }
  const rules = { ...defaultRules };
  for (const [key, value] of Object.entries(input.rules)) {
    if (!Object.hasOwn(defaultRules, key)) throw new RangeError('Regra desconhecida: ' + key);
    if (typeof value !== 'boolean') throw new RangeError('Regra precisa ser booleana: ' + key);
    rules[key as ScoringRuleId] = value;
  }
  return { weights, rules };
}

/** Leitura tolerante do que está salvo: valores inválidos/ausentes voltam ao padrão. */
export function storedScoringConfig(weights: unknown, rules: unknown): ScoringConfig {
  const w = isObject(weights) ? weights : {};
  const r = isObject(rules) ? rules : {};
  const config = structuredClone(defaultConfig);
  for (const [key, f] of ranges) {
    const v = w[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max)
      config.weights[key] = v;
  }
  for (const key of Object.keys(defaultRules) as ScoringRuleId[])
    if (typeof r[key] === 'boolean') config.rules[key] = r[key] as boolean;
  return config;
}
