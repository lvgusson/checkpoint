import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Desire, GameStatus } from '../../../../../packages/core/src/models';
import { testIdKey, testIdValue } from '@/components/ui/test-id';
import { cn } from '@/lib/utils';
import { AppLoader } from '../loader/AppLoader';
import { MetadataBadge } from './MetadataBadge';
import type { MetadataKind } from './presentation';

type Common = {
  label: string;
  kind: MetadataKind;
  options: string[];
  'data-testid': string;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
};

function metadataOptionKey(kind: MetadataKind, value: string) {
  const codes = kind === 'status' ? GameStatus : kind === 'desire' ? Desire : {};
  const code = Object.entries(codes).find(([, label]) => label === value)?.[0];
  return code ? testIdKey(code) : testIdValue(value);
}

type Props =
  | (Common & { multiple?: false; value: string; onValueChange(value: string): void })
  | (Common & {
      multiple: true;
      values: string[];
      max?: number;
      onValuesChange(values: string[]): void;
    });

/** Combobox of metadata badges; single or multiple (limited by `max`). Keyboard: arrows, Home/End, Enter/Space, Escape, Tab. */
export function MetadataSelect(props: Props) {
  const {
    label,
    kind,
    options,
    isLoading = false,
    isError = false,
    onRetry,
    disabled = false,
  } = props;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const max = props.multiple ? (props.max ?? 3) : 0;
  const selectedValues = props.multiple ? props.values : props.value ? [props.value] : [];
  const selected = (item: string) => selectedValues.includes(item);
  const unavailable = (item: string) =>
    props.multiple === true && !selected(item) && props.values.length >= max;

  const filteredOptions =
    props.searchable && searchQuery.trim()
      ? options.filter((item) => item.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      : options;

  const close = (restoreFocus = true) => {
    setOpen(false);
    setSearchQuery('');
    if (restoreFocus) {
      root.current?.querySelector<HTMLButtonElement>('.select-trigger')?.focus();
    }
  };

  const openList = () => {
    const idx = !props.multiple && props.value ? filteredOptions.indexOf(props.value) : -1;
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) {
        close(false);
      }
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = optionsListRef.current;
    if (!list) return;
    const item = list.children[highlightedIndex] as HTMLElement | undefined;
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, open]);

  function choose(item: string) {
    if (unavailable(item)) return;
    if (props.multiple) {
      props.onValuesChange(
        selected(item) ? props.values.filter((v) => v !== item) : [...props.values, item],
      );
    } else {
      props.onValueChange(item);
      close(true);
    }
  }

  function navigate(event: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        openList();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      close(false);
      return;
    }
    if (filteredOptions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(filteredOptions.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = filteredOptions[highlightedIndex];
      if (item) choose(item);
    }
  }

  const highlightedItem = filteredOptions[highlightedIndex];
  const activeDescendantId =
    open && highlightedItem
      ? `${id}-option-${metadataOptionKey(kind, highlightedItem)}`
      : undefined;

  return (
    <div
      ref={root}
      className={cn('relative block min-w-0', props.className ?? 'mt-[17px]', open && 'z-30')}
    >
      <span className="block text-[11px] font-semibold max-sm:text-[13px]" id={id + '-label'}>
        {label}
      </span>
      <button
        data-testid={props['data-testid']}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-disabled={disabled || undefined}
        className={cn(
          'select-trigger mt-2 flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[7px] border border-border bg-card px-3 pr-3.5 py-2 text-left text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-activedescendant={activeDescendantId}
        onClick={() => !disabled && (open ? close() : openList())}
        onKeyDown={navigate}
      >
        <span className="flex min-w-0 flex-wrap gap-[5px]" id={id + '-value'}>
          {selectedValues.length ? (
            selectedValues.map((item) => (
              <MetadataBadge
                key={item}
                kind={kind}
                value={item}
                className="!whitespace-normal text-left text-xs leading-snug max-sm:text-[13px]"
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">
              {isLoading
                ? 'Carregando…'
                : props.multiple
                  ? `Selecionar até ${max} tags`
                  : 'Selecionar'}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="absolute inset-x-0 top-full z-[30] mt-[5px] flex max-h-[300px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-lg"
          role="listbox"
          tabIndex={-1}
          id={id}
          aria-labelledby={id + '-label'}
          aria-multiselectable={props.multiple || undefined}
        >
          {props.searchable && (
            <div className="border-b border-border p-2">
              <input
                type="search"
                role="searchbox"
                data-testid={`${props['data-testid']}-search`}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                placeholder={props.searchPlaceholder ?? 'Buscar…'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div ref={optionsListRef} className="flex-1 overflow-auto overscroll-contain p-1.5">
            {isLoading ? (
              <div
                data-testid={`${props['data-testid']}-loading`}
                className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
                role="status"
              >
                <AppLoader size="sm" layout="inline" label="Carregando opções…" variant="spinner" />
              </div>
            ) : isError ? (
              <div
                data-testid={`${props['data-testid']}-error`}
                className="flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground"
                role="alert"
              >
                <span>Não foi possível carregar as opções.</span>
                {onRetry && (
                  <button
                    data-testid={`${props['data-testid']}-retry`}
                    type="button"
                    onClick={onRetry}
                    className="button inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div
                data-testid={`${props['data-testid']}-empty`}
                className="py-4 text-center text-xs text-muted-foreground"
              >
                Nenhuma opção disponível
              </div>
            ) : (
              filteredOptions.map((item, index) => {
                const isSelected = selected(item);
                const isUnavailable = unavailable(item);
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    id={`${id}-option-${metadataOptionKey(kind, item)}`}
                    data-testid={`${props['data-testid']}-option-${metadataOptionKey(kind, item)}`}
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isUnavailable}
                    tabIndex={isSelected ? 0 : -1}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={cn(
                      'flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-transparent p-2 text-left text-foreground hover:bg-secondary focus-visible:bg-secondary',
                      isHighlighted && 'bg-secondary',
                      isUnavailable && 'cursor-not-allowed opacity-45',
                    )}
                    onClick={() => choose(item)}
                  >
                    <MetadataBadge
                      kind={kind}
                      value={item}
                      className="!whitespace-normal text-left text-xs leading-snug"
                    />
                    <span className="min-w-4 text-primary" aria-hidden="true">
                      {isSelected ? '✓' : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {props.multiple && (
        <small className="mt-1.5 block text-xs text-muted-foreground">
          {`${props.values.length} / ${max} tags selecionadas`}
        </small>
      )}
    </div>
  );
}
