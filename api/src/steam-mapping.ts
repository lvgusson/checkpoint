// Converte um app da Steam num `Game` do app (cadastro da lista de desejos).
// Gênero, coop e estrutura saem das tags da comunidade (pt-BR), mapeadas para o
// vocabulário que a biblioteca já usa; o que não dá para inferir fica vazio.
import type { Desire, Game, SteamApp } from '../../shared/models.ts';

const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Tag da Steam (chave normalizada) -> gênero principal da biblioteca. */
const GENRE_BY_TAG = new Map(
  (
    [
      [['Tiro em Primeira Pessoa (FPS)'], 'FPS'],
      [['Tiro em Terceira Pessoa'], 'TPS'],
      [['Metroidvania'], 'Metroidvania'],
      [['Soulslike'], 'Soulslike'],
      [['Plataforma', 'Plataforma 2D', 'Plataforma 3D', 'Plataforma de Precisão'], 'Plataforma'],
      [['RPG de Ação', 'Jogo de Ação Focado em Personagem'], 'RPG de ação'],
      [['RPG Tático', 'Tática por Turnos', 'RPG de Estratégia'], 'RPG tático'],
      [['JRPG', 'CRPG', 'RPG de Grupos'], 'RPG narrativo'],
      [
        [
          'Roguelike',
          'Roguelite',
          'Roguelike de Ação',
          'Roguelike Tradicional',
          'Montagem de Decks Roguelike',
        ],
        'Roguelike e roguelite',
      ],
      [
        ['Estratégia em Tempo Real (RTS)', 'Tática em Tempo Real', 'Estratégia em Tempo Real'],
        'Estratégia em tempo real',
      ],
      [['Estratégia em Turnos', 'Grande Estratégia'], 'Estratégia em turnos'],
      [['Terror de Sobrevivência'], 'Survival horror'],
      [['Quebra-Cabeça', 'Plataforma com Quebra-Cabeça'], 'Puzzle'],
      [['Sobrevivência', 'Sobrevivência em Mundo Aberto'], 'Sobrevivência'],
      [['Hack and Slash'], 'Hack and slash'],
      [['Furtivo'], 'Furtividade'],
      [['Luta', 'Luta 2D', 'Luta 3D'], 'Luta'],
      [['Esportes'], 'Esporte'],
      [['MMORPG', 'Multijogador Massivo'], 'MMORPG'],
      [['Tower Defense'], 'Tower defense'],
      [["Shoot 'Em Up", "Shoot 'em up"], "Shoot 'em up"],
      [["Beat 'em up", "Beat 'Em Up"], "Beat 'em up"],
      [['Arcade'], 'Arcade'],
      [['Combat Flight Simulator', 'Simulador de Combate Aéreo'], 'Combate aéreo'],
      [
        [
          'Gerenciamento',
          'Construção de Cidades',
          'Simulação',
          'Simulador de Colônias',
          'Automação',
        ],
        'Gestão e simulação',
      ],
      [
        ['Romance Visual', 'Escolha a sua Aventura', 'Simulador de Caminhada'],
        'Aventura narrativa',
      ],
      [['Ação / Aventura'], 'Ação e aventura'],
    ] as [string[], string][]
  ).flatMap(([tags, genre]) => tags.map((t) => [key(t), genre] as const)),
);

/** Tags genéricas: só viram gênero se nada mais específico existir, e nunca tag secundária. */
const GENERIC = new Map(
  (
    [
      ['Ação', 'Ação e aventura'],
      ['Aventura', 'Aventura narrativa'],
      ['RPG', 'RPG de ação'],
      ['Estratégia', 'Estratégia em turnos'],
    ] as const
  ).map(([t, g]) => [key(t), g]),
);
const NOT_SECONDARY = new Set(
  [
    'Indie',
    'Um Jogador',
    'Casual',
    'Trilha Sonora Ótima',
    'Trilha Sonora Boa',
    'Multijogador',
    'Cooperativo',
    'Cooperativo Local',
    'Cooperativo On-line',
    'Acesso Antecipado',
    'Gratuito para Jogar',
    'Clássico',
    'Ótima Trilha Sonora',
    'Atmosférico',
    'Bonito',
    'Fofo',
    'Engraçado',
    'Colorido',
  ].map(key),
);

export function primaryGenreFromTags(tags: string[]): string {
  for (const t of tags) {
    const g = GENRE_BY_TAG.get(key(t));
    if (g) return g;
  }
  for (const t of tags) {
    const g = GENERIC.get(key(t));
    if (g) return g;
  }
  return tags[0]?.trim() ?? '';
}

export function coopFromTags(tags: string[]): string {
  const k = new Set(tags.map(key));
  const local = k.has(key('Cooperativo Local'));
  const online = k.has(key('Cooperativo On-line'));
  if (local && online) return 'Local e online';
  if (online) return 'Online';
  if (local) return 'Local';
  if (k.has(key('Cooperativo')) || k.has(key('Campanha Cooperativa'))) return 'Sim';
  return 'Não';
}

export function structureFromTags(tags: string[]): string {
  const k = new Set(tags.map(key));
  if (
    ['Multijogador Massivo', 'MMORPG', 'MOBA', 'eSports', 'Battle Royale'].some((t) =>
      k.has(key(t)),
    )
  )
    return 'Sem fim definido';
  if ([...k].some((t) => t.startsWith('roguel'))) return 'Campanha + repetição';
  if (k.has(key('Sandbox'))) return 'Campanha + sandbox';
  return 'Campanha';
}

/** Até 3 tags secundárias: as mais votadas que não são o gênero nem genéricas. */
export function secondaryTagsFromTags(tags: string[], primaryGenre: string): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const k = key(t);
    if (
      out.length >= 3 ||
      NOT_SECONDARY.has(k) ||
      GENERIC.has(k) ||
      k === key(primaryGenre) ||
      GENRE_BY_TAG.get(k) === primaryGenre
    )
      continue;
    if (!out.some((o) => key(o) === k)) out.push(t.trim());
  }
  return out;
}

/** Game novo (status Desejado) a partir do app da Steam; `id` é definido pelo repositório. */
export function gameFromSteamApp(app: SteamApp, desire: Desire = 'Média'): Game {
  const primaryGenre = primaryGenreFromTags(app.tags);
  return {
    ...emptyGame(app.name),
    primaryGenre,
    desire,
    store: 'Steam',
    secondaryTags: secondaryTagsFromTags(app.tags, primaryGenre),
    structure: structureFromTags(app.tags),
    coop: coopFromTags(app.tags),
    steamAppId: app.appId,
  };
}

export function emptyGame(name: string): Game {
  return {
    id: '',
    name: name.trim(),
    primaryGenre: '',
    status: 'Desejado',
    desire: 'Média',
    store: '',
    platform: 'PC',
    secondaryTags: [],
    pace: '',
    structure: 'Campanha',
    actualHours: null,
    startedAt: null,
    finishedAt: null,
    rating: null,
    notes: '',
    mainHours: null,
    extraHours: null,
    completionistHours: null,
    size: '',
    timeVerification: '',
    timeSource: '',
    reviewNotes: '',
    previousEstimatedHours: null,
    coop: '',
    mechanic: '',
    prerequisiteId: null,
    steamAppId: null,
    steamHours: null,
    steamUpdatedAt: null,
    updatedAt: null,
    imported: {
      plannedHours: null,
      affinity: null,
      baseScore: null,
      queueScore: null,
      previousPendingId: null,
    },
  };
}
