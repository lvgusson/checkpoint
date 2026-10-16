import React, { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext, type AuthValue } from '@/auth/AuthProvider';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Combobox } from './ui/combobox';
import { MetadataBadge } from '@/features/metadata/MetadataBadge';
import { MetadataSelect } from '@/features/metadata/MetadataSelect';
import type { MetadataKind } from '@/features/metadata/presentation';
import { ConfirmDialog, EmptyState, ErrorState } from '@checkpoint/ui-react';
import { AppLoader } from '@/features/loader/AppLoader';
import { SwordArt } from '@/features/loader/SwordArt';
import { Bonfire } from '@/features/immediate/Bonfire';
import { ImmediateButton } from '@/features/immediate/ImmediateButton';
import { PlayingButton } from '@/features/playing/PlayingButton';
import { FinishIcon } from '@/features/finish-dialog/FinishIcon';
import { GameActionIcons } from '@/features/details/GameActionIcons';
import type { Desire, GameStatus, ScoredGame } from '../../../../packages/core/src/models';

export enum ComponentCatalogId {
  Button = 'button',
  Input = 'input',
  Combobox = 'combobox',
  MetadataBadge = 'metadata-badge',
  MetadataSelect = 'metadata-select',
  ConfirmDialog = 'confirm-dialog',
  AppLoader = 'app-loader',
  SwordArt = 'sword-art',
  Bonfire = 'bonfire',
  ImmediateButton = 'immediate-button',
  PlayingButton = 'playing-button',
  FinishIcon = 'finish-icon',
  GameActionIcons = 'game-action-icons',
  EmptyState = 'empty-state',
  ErrorState = 'error-state',
}

export type ComponentCategory = 'primitives' | 'feedback' | 'actions' | 'metadata' | 'dialogs';

export interface PropDefinition {
  name: string;
  label: string;
  type: 'string' | 'boolean' | 'number' | 'select';
  options?: string[];
  default: unknown;
  min?: number;
  max?: number;
}

export interface ComponentEntry {
  id: ComponentCatalogId | string;
  name: string;
  description: string;
  category: ComponentCategory;
  propDefinitions: PropDefinition[];
  defaultProps: Record<string, unknown>;
  render: (props: Record<string, unknown>) => ReactNode;
}

const showcaseQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const showcaseAuthValue: AuthValue = {
  ready: true,
  enabled: true,
  githubEnabled: false,
  session: null,
  initError: '',
  user: null,
  userId: 'local',
};

export function ShowcaseHarness({ children }: { children: ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: showcaseQueryClient },
    React.createElement(AuthContext.Provider, { value: showcaseAuthValue }, children),
  );
}

function ConfirmDialogWrapper(props: Record<string, unknown>) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof props.open === 'boolean';
  const open = isControlled ? Boolean(props.open) : internalOpen;

  return React.createElement(
    'div',
    { className: 'flex flex-col items-start gap-4' },
    React.createElement(
      Button,
      {
        variant: props.destructive ? 'destructive' : 'default',
        onClick: () => setInternalOpen(true),
      },
      open ? 'Diálogo aberto' : 'Abrir diálogo',
    ),
    React.createElement(ConfirmDialog, {
      open,
      title: String(props.title ?? ''),
      description: props.description as ReactNode,
      confirmLabel: String(props.confirmLabel ?? 'Confirmar'),
      cancelLabel: String(props.cancelLabel ?? 'Cancelar'),
      destructive: Boolean(props.destructive),
      onConfirm: () => setInternalOpen(false),
      onCancel: () => setInternalOpen(false),
    }),
  );
}

function ComboboxWrapper(props: Record<string, unknown>) {
  const [internalVal, setVal] = useState<string | undefined>(undefined);
  const val = (props.value as string | undefined) ?? internalVal ?? 'rpg';

  return React.createElement(
    'div',
    { className: 'w-full max-w-xs' },
    React.createElement(Combobox, {
      label: props.label as string,
      placeholder: props.placeholder as string,
      searchable: Boolean(props.searchable),
      disabled: Boolean(props.disabled),
      options: [
        { value: 'action', label: 'Ação e Aventura' },
        { value: 'rpg', label: 'RPG de Turnos' },
        { value: 'metroidvania', label: 'Metroidvania' },
        { value: 'roguelike', label: 'Roguelike' },
        { value: 'puzzle', label: 'Quebra-cabeça' },
      ],
      value: val,
      onValueChange: setVal,
    }),
  );
}

function MetadataSelectWrapper(props: Record<string, unknown>) {
  const [internalVal, setVal] = useState<string | undefined>(undefined);
  const val = (props.value as string | undefined) ?? internalVal ?? 'Jogando';

  return React.createElement(
    'div',
    { className: 'w-full max-w-xs' },
    React.createElement(MetadataSelect, {
      'data-testid': 'showcase-metadata-select',
      label: String(props.label ?? ''),
      kind: (props.kind as MetadataKind) ?? 'status',
      disabled: Boolean(props.disabled),
      searchable: Boolean(props.searchable),
      options: ['Não iniciado', 'Jogando', 'Pausado', 'Finalizado', 'Abandonado'],
      value: val,
      onValueChange: setVal,
      className: 'mt-0',
    }),
  );
}

const registry: Record<ComponentCatalogId, ComponentEntry> = {
  [ComponentCatalogId.Button]: {
    id: ComponentCatalogId.Button,
    name: 'Button',
    description: 'Botão com suporte a múltiplos tamanhos, estados e variantes visuais semânticas.',
    category: 'primitives',
    propDefinitions: [
      { name: 'children', label: 'Texto do Botão', type: 'string', default: 'Salvar alterações' },
      {
        name: 'variant',
        label: 'Variante Visual',
        type: 'select',
        options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
        default: 'default',
      },
      {
        name: 'size',
        label: 'Tamanho',
        type: 'select',
        options: ['default', 'sm', 'lg', 'icon'],
        default: 'default',
      },
      { name: 'disabled', label: 'Desabilitado', type: 'boolean', default: false },
    ],
    defaultProps: {
      children: 'Salvar alterações',
      variant: 'default',
      size: 'default',
      disabled: false,
    },
    render: (props) =>
      React.createElement(
        Button,
        {
          variant: props.variant as
            'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link',
          size: props.size as 'default' | 'sm' | 'lg' | 'icon',
          disabled: Boolean(props.disabled),
        },
        props.children as ReactNode,
      ),
  },

  [ComponentCatalogId.Input]: {
    id: ComponentCatalogId.Input,
    name: 'Input',
    description: 'Campo de entrada de texto flexível com suporte a foco acessível e temas.',
    category: 'primitives',
    propDefinitions: [
      {
        name: 'placeholder',
        label: 'Placeholder',
        type: 'string',
        default: 'Digite o nome do jogo…',
      },
      {
        name: 'type',
        label: 'Tipo',
        type: 'select',
        options: ['text', 'password', 'email', 'number', 'search'],
        default: 'text',
      },
      { name: 'disabled', label: 'Desabilitado', type: 'boolean', default: false },
    ],
    defaultProps: {
      placeholder: 'Digite o nome do jogo…',
      type: 'text',
      disabled: false,
    },
    render: (props) =>
      React.createElement(Input, {
        placeholder: String(props.placeholder ?? ''),
        type: String(props.type ?? 'text'),
        disabled: Boolean(props.disabled),
        className: 'max-w-xs',
        readOnly: true,
      }),
  },

  [ComponentCatalogId.Combobox]: {
    id: ComponentCatalogId.Combobox,
    name: 'Combobox',
    description: 'Menu seletor com filtragem em tempo real e suporte a opções acessíveis.',
    category: 'primitives',
    propDefinitions: [
      { name: 'label', label: 'Rótulo', type: 'string', default: 'Gênero principal' },
      {
        name: 'placeholder',
        label: 'Placeholder',
        type: 'string',
        default: 'Selecione um gênero…',
      },
      { name: 'searchable', label: 'Pesquisável', type: 'boolean', default: true },
      { name: 'disabled', label: 'Desabilitado', type: 'boolean', default: false },
    ],
    defaultProps: {
      label: 'Gênero principal',
      placeholder: 'Selecione um gênero…',
      searchable: true,
      disabled: false,
    },
    render: (props) => React.createElement(ComboboxWrapper, props),
  },

  [ComponentCatalogId.MetadataBadge]: {
    id: ComponentCatalogId.MetadataBadge,
    name: 'MetadataBadge',
    description: 'Etiqueta com ícone e cor semântica indicando categorias, status e ritmos.',
    category: 'metadata',
    propDefinitions: [
      {
        name: 'kind',
        label: 'Tipo de Metadado',
        type: 'select',
        options: ['genre', 'status', 'pace', 'structure', 'desire', 'tag'],
        default: 'genre',
      },
      { name: 'value', label: 'Valor', type: 'string', default: 'RPG de Turnos' },
    ],
    defaultProps: {
      kind: 'genre',
      value: 'RPG de Turnos',
    },
    render: (props) =>
      React.createElement(MetadataBadge, {
        kind: (props.kind as MetadataKind) ?? 'genre',
        value: String(props.value ?? ''),
      }),
  },

  [ComponentCatalogId.MetadataSelect]: {
    id: ComponentCatalogId.MetadataSelect,
    name: 'MetadataSelect',
    description:
      'Combobox temático para seleção de atributos com renderização de tags estilizadas.',
    category: 'metadata',
    propDefinitions: [
      { name: 'label', label: 'Rótulo', type: 'string', default: 'Status de Jogo' },
      {
        name: 'kind',
        label: 'Tipo',
        type: 'select',
        options: ['status', 'genre', 'desire'],
        default: 'status',
      },
      { name: 'searchable', label: 'Pesquisável', type: 'boolean', default: true },
      { name: 'disabled', label: 'Desabilitado', type: 'boolean', default: false },
    ],
    defaultProps: {
      label: 'Status de Jogo',
      kind: 'status',
      searchable: true,
      disabled: false,
    },
    render: (props) => React.createElement(MetadataSelectWrapper, props),
  },

  [ComponentCatalogId.ConfirmDialog]: {
    id: ComponentCatalogId.ConfirmDialog,
    name: 'ConfirmDialog',
    description: 'Diálogo de confirmação modal acessível sobre o elemento nativo dialog.',
    category: 'dialogs',
    propDefinitions: [
      { name: 'title', label: 'Título', type: 'string', default: 'Apagar jogo da lista?' },
      {
        name: 'description',
        label: 'Descrição',
        type: 'string',
        default: 'Esta ação não poderá ser desfeita posteriormente.',
      },
      { name: 'confirmLabel', label: 'Botão de Confirmação', type: 'string', default: 'Apagar' },
      { name: 'cancelLabel', label: 'Botão de Cancelamento', type: 'string', default: 'Cancelar' },
      { name: 'destructive', label: 'Ação Destrutiva', type: 'boolean', default: true },
      { name: 'open', label: 'Aberto', type: 'boolean', default: false },
    ],
    defaultProps: {
      title: 'Apagar jogo da lista?',
      description: 'Esta ação não poderá ser desfeita posteriormente.',
      confirmLabel: 'Apagar',
      cancelLabel: 'Cancelar',
      destructive: true,
      open: false,
    },
    render: (props) => React.createElement(ConfirmDialogWrapper, props),
  },

  [ComponentCatalogId.AppLoader]: {
    id: ComponentCatalogId.AppLoader,
    name: 'AppLoader',
    description: 'Indicador de progresso com variantes temáticas como a espada e o spinner padrão.',
    category: 'feedback',
    propDefinitions: [
      { name: 'label', label: 'Mensagem', type: 'string', default: 'Carregando jogos…' },
      {
        name: 'variant',
        label: 'Variante',
        type: 'select',
        options: ['sword', 'spinner', 'dots', 'pulse', 'bar'],
        default: 'sword',
      },
      {
        name: 'layout',
        label: 'Disposição',
        type: 'select',
        options: ['stacked', 'inline'],
        default: 'stacked',
      },
      {
        name: 'size',
        label: 'Tamanho',
        type: 'select',
        options: ['sm', 'md', 'lg'],
        default: 'md',
      },
    ],
    defaultProps: {
      label: 'Carregando jogos…',
      variant: 'sword',
      layout: 'stacked',
      size: 'md',
    },
    render: (props) =>
      React.createElement(AppLoader, {
        label: String(props.label ?? ''),
        variant: props.variant as 'sword' | 'spinner' | 'dots' | 'pulse' | 'bar',
        layout: props.layout as 'stacked' | 'inline',
        size: props.size as 'sm' | 'md' | 'lg',
      }),
  },

  [ComponentCatalogId.SwordArt]: {
    id: ComponentCatalogId.SwordArt,
    name: 'SwordArt',
    description: 'Ilustração vetorial animada da lendária espada fincada na fogueira.',
    category: 'feedback',
    propDefinitions: [
      {
        name: 'size',
        label: 'Tamanho',
        type: 'select',
        options: ['sm', 'md', 'lg'],
        default: 'md',
      },
    ],
    defaultProps: {
      size: 'md',
    },
    render: () => React.createElement(SwordArt),
  },

  [ComponentCatalogId.Bonfire]: {
    id: ComponentCatalogId.Bonfire,
    name: 'Bonfire',
    description: 'Ícone de fogueira estilizado com suporte a modo monocromático ou paleta viva.',
    category: 'feedback',
    propDefinitions: [
      { name: 'mono', label: 'Modo Monocromático', type: 'boolean', default: false },
    ],
    defaultProps: {
      mono: false,
    },
    render: (props) =>
      React.createElement(
        'div',
        { className: 'flex items-center justify-center p-4' },
        React.createElement(Bonfire, { mono: Boolean(props.mono) }),
      ),
  },

  [ComponentCatalogId.ImmediateButton]: {
    id: ComponentCatalogId.ImmediateButton,
    name: 'ImmediateButton',
    description: 'Botão de alternância de vontade imediata com fogueira e feedback otimista.',
    category: 'actions',
    propDefinitions: [
      { name: 'gameName', label: 'Nome do Jogo', type: 'string', default: 'Elden Ring' },
      { name: 'isImmediate', label: 'Vontade Imediata', type: 'boolean', default: true },
    ],
    defaultProps: {
      gameName: 'Elden Ring',
      isImmediate: true,
    },
    render: (props) =>
      React.createElement(
        ShowcaseHarness,
        null,
        React.createElement(
          'div',
          { className: 'flex items-center justify-center p-2' },
          React.createElement(ImmediateButton, {
            'data-testid': 'showcase-immediate-button',
            game: {
              id: 'showcase-game-1',
              name: String(props.gameName ?? 'Elden Ring'),
              desire: (props.isImmediate ? 'Imediata' : 'Normal') as Desire,
            },
          }),
        ),
      ),
  },

  [ComponentCatalogId.PlayingButton]: {
    id: ComponentCatalogId.PlayingButton,
    name: 'PlayingButton',
    description: 'Botão para marcar ou pausar a gameplay do título selecionado na fila.',
    category: 'actions',
    propDefinitions: [
      { name: 'gameName', label: 'Nome do Jogo', type: 'string', default: 'Chrono Trigger' },
      { name: 'isPlaying', label: 'Em Progresso', type: 'boolean', default: true },
    ],
    defaultProps: {
      gameName: 'Chrono Trigger',
      isPlaying: true,
    },
    render: (props) =>
      React.createElement(
        ShowcaseHarness,
        null,
        React.createElement(
          'div',
          { className: 'flex items-center justify-center p-2' },
          React.createElement(PlayingButton, {
            'data-testid': 'showcase-playing-button',
            game: {
              id: 'showcase-game-2',
              name: String(props.gameName ?? 'Chrono Trigger'),
              status: (props.isPlaying ? 'Jogando' : 'Não iniciado') as GameStatus,
              coverUrl: null,
              primaryGenre: 'JRPG',
            } as ScoredGame,
          }),
        ),
      ),
  },

  [ComponentCatalogId.FinishIcon]: {
    id: ComponentCatalogId.FinishIcon,
    name: 'FinishIcon',
    description: 'Ícone de bandeira de chegada indicando conclusão de jornada gamer.',
    category: 'actions',
    propDefinitions: [
      { name: 'withFlagDetail', label: 'Detalhes Quadriculados', type: 'boolean', default: true },
    ],
    defaultProps: {
      withFlagDetail: true,
    },
    render: (props) =>
      React.createElement(
        'div',
        { className: 'flex items-center justify-center p-3 text-primary' },
        React.createElement(FinishIcon, { withFlagDetail: Boolean(props.withFlagDetail) }),
      ),
  },

  [ComponentCatalogId.GameActionIcons]: {
    id: ComponentCatalogId.GameActionIcons,
    name: 'GameActionIcons',
    description:
      'Barra completa de ações do card: fogueira, controle de jogo, conclusão e aquisição.',
    category: 'actions',
    propDefinitions: [
      { name: 'gameName', label: 'Nome do Jogo', type: 'string', default: 'Hollow Knight' },
      { name: 'isPurchased', label: 'Comprado', type: 'boolean', default: true },
      { name: 'isPlaying', label: 'Jogando', type: 'boolean', default: false },
      { name: 'isImmediate', label: 'Vontade Imediata', type: 'boolean', default: true },
    ],
    defaultProps: {
      gameName: 'Hollow Knight',
      isPurchased: true,
      isPlaying: false,
      isImmediate: true,
    },
    render: (props) =>
      React.createElement(
        ShowcaseHarness,
        null,
        React.createElement(
          'div',
          { className: 'w-full max-w-xs rounded-lg border border-border bg-card p-2' },
          React.createElement(GameActionIcons, {
            game: {
              id: 'showcase-game-3',
              name: String(props.gameName ?? 'Hollow Knight'),
              status: (props.isPlaying
                ? 'Jogando'
                : props.isPurchased
                  ? 'Não iniciado'
                  : 'Desejado') as GameStatus,
              desire: (props.isImmediate ? 'Imediata' : 'Normal') as Desire,
              coverUrl: null,
              primaryGenre: 'Metroidvania',
            } as ScoredGame,
            onFinish: () => {},
            testIdPrefix: 'showcase-actions',
          }),
        ),
      ),
  },

  [ComponentCatalogId.EmptyState]: {
    id: ComponentCatalogId.EmptyState,
    name: 'EmptyState',
    description: 'Placeholder neutro indicando ausência de itens para a visualização atual.',
    category: 'feedback',
    propDefinitions: [
      { name: 'title', label: 'Título', type: 'string', default: 'Nenhum item na fila' },
      {
        name: 'description',
        label: 'Descrição',
        type: 'string',
        default: 'Adicione jogos do seu catálogo para começar a ordenar.',
      },
      { name: 'showAction', label: 'Exibir Botão', type: 'boolean', default: true },
    ],
    defaultProps: {
      title: 'Nenhum item na fila',
      description: 'Adicione jogos do seu catálogo para começar a ordenar.',
      showAction: true,
    },
    render: (props) =>
      React.createElement(EmptyState, {
        title: String(props.title ?? ''),
        description: props.description as ReactNode,
        action: props.showAction
          ? React.createElement(Button, { className: 'mt-4' }, 'Explorar catálogo')
          : undefined,
      }),
  },

  [ComponentCatalogId.ErrorState]: {
    id: ComponentCatalogId.ErrorState,
    name: 'ErrorState',
    description: 'Mensagem de falha destacada com ação acessível de recuperação.',
    category: 'feedback',
    propDefinitions: [
      {
        name: 'message',
        label: 'Mensagem',
        type: 'string',
        default: 'Falha ao sincronizar as informações com o servidor.',
      },
      { name: 'retryLabel', label: 'Texto do Botão', type: 'string', default: 'Tentar de novo' },
      { name: 'hasRetry', label: 'Habilitar Repetição', type: 'boolean', default: true },
    ],
    defaultProps: {
      message: 'Falha ao sincronizar as informações com o servidor.',
      retryLabel: 'Tentar de novo',
      hasRetry: true,
    },
    render: (props) =>
      React.createElement(ErrorState, {
        message: String(props.message ?? ''),
        retryLabel: String(props.retryLabel ?? 'Tentar de novo'),
        onRetry: props.hasRetry ? () => {} : undefined,
      }),
  },
};

export function getComponent(id: string): ComponentEntry | undefined {
  return registry[id as ComponentCatalogId];
}

export function getAllComponents(): ComponentEntry[] {
  return Object.values(registry);
}
