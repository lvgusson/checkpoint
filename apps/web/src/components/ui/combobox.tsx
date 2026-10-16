import * as React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLoader } from '@/features/loader/AppLoader';

export interface ComboboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ComboboxProps {
  id?: string;
  label?: string;
  options: (string | ComboboxOption)[];
  value?: string;
  onValueChange?: (value: string) => void;
  multiple?: boolean;
  values?: string[];
  max?: number;
  onValuesChange?: (values: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  'data-testid'?: string;
  renderOption?: (option: ComboboxOption, selected: boolean) => React.ReactNode;
  renderValue?: (selectedOptions: ComboboxOption[]) => React.ReactNode;
}

export function Combobox({
  id: customId,
  label,
  options,
  value,
  onValueChange,
  multiple = false,
  values,
  max = 0,
  onValuesChange,
  placeholder = 'Selecionar…',
  searchable = false,
  searchPlaceholder,
  emptyText = 'Nenhuma opção encontrada',
  disabled = false,
  isLoading = false,
  isError = false,
  onRetry,
  className,
  'data-testid': testId,
  renderOption,
  renderValue,
}: ComboboxProps) {
  const generatedId = useId();
  const id = customId || generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const normalizedOptions: ComboboxOption[] = React.useMemo(
    () => options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)),
    [options],
  );

  const filteredOptions = React.useMemo(() => {
    if (!searchable || !searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.trim().toLowerCase();
    return normalizedOptions.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [normalizedOptions, searchable, searchQuery]);

  const selectedValues = React.useMemo(
    () => (multiple ? (values ?? []) : value ? [value] : []),
    [multiple, values, value],
  );

  const selectedOptions = React.useMemo(
    () => normalizedOptions.filter((opt) => selectedValues.includes(opt.value)),
    [normalizedOptions, selectedValues],
  );

  const selectedOption = React.useMemo(
    () => normalizedOptions.find((opt) => opt.value === value),
    [normalizedOptions, value],
  );

  const isSelected = (val: string) => selectedValues.includes(val);
  const isUnavailable = (val: string) =>
    Boolean(multiple && max > 0 && !isSelected(val) && selectedValues.length >= max);

  const close = (restoreFocus = true) => {
    setOpen(false);
    setSearchQuery('');
    if (restoreFocus) {
      rootRef.current?.querySelector<HTMLButtonElement>('.combobox-trigger')?.focus();
    }
  };

  const openList = () => {
    const idx = !multiple && value ? filteredOptions.findIndex((opt) => opt.value === value) : -1;
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  function choose(option: ComboboxOption) {
    if (option.disabled || isUnavailable(option.value)) return;
    if (multiple) {
      const selected = isSelected(option.value);
      const next = selected
        ? selectedValues.filter((v) => v !== option.value)
        : [...selectedValues, option.value];
      onValuesChange?.(next);
    } else {
      onValueChange?.(option.value);
      close(true);
    }
  }

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        close(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
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

  function handleKeyDown(event: React.KeyboardEvent) {
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
      const option = filteredOptions[highlightedIndex];
      if (option) choose(option);
    }
  }

  const highlightedOption = filteredOptions[highlightedIndex];
  const activeDescendantId =
    open && highlightedOption ? `${id}-opt-${highlightedIndex}` : undefined;

  return (
    <div ref={rootRef} className={cn('relative block min-w-0', open && 'z-30', className)}>
      {label && (
        <span
          className="mb-1 block text-[11px] font-semibold text-foreground max-sm:text-[13px]"
          id={`${id}-label`}
        >
          {label}
        </span>
      )}
      <button
        data-testid={testId}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-labelledby={label ? `${id}-label ${id}-value` : undefined}
        aria-label={label ? undefined : placeholder}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-activedescendant={activeDescendantId}
        onClick={() => !disabled && (open ? close() : openList())}
        onKeyDown={handleKeyDown}
        className={cn(
          'combobox-trigger flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[7px] border border-border bg-card px-3 pr-3.5 py-2 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span id={`${id}-value`} className="truncate">
          {isLoading && selectedValues.length === 0 ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : renderValue ? (
            renderValue(selectedOptions)
          ) : multiple ? (
            selectedOptions.length ? (
              selectedOptions.map((o) => o.label).join(', ')
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )
          ) : selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
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
          id={`${id}-listbox`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-multiselectable={multiple || undefined}
          className="absolute inset-x-0 top-full z-[30] mt-[5px] flex max-h-[280px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-lg"
        >
          {searchable && (
            <div className="border-b border-border p-2">
              <input
                type="search"
                role="searchbox"
                data-testid={testId ? `${testId}-search` : undefined}
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                placeholder={searchPlaceholder ?? 'Buscar…'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div
            ref={optionsListRef}
            className="max-h-[280px] flex-1 overflow-auto overscroll-contain p-1.5"
          >
            {isLoading ? (
              <div
                data-testid={testId ? `${testId}-loading` : undefined}
                className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
                role="status"
              >
                <AppLoader size="sm" layout="inline" label="Carregando opções…" variant="spinner" />
              </div>
            ) : isError ? (
              <div
                data-testid={testId ? `${testId}-error` : undefined}
                className="flex flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground"
                role="alert"
              >
                <span>Não foi possível carregar as opções.</span>
                {onRetry && (
                  <button
                    data-testid={testId ? `${testId}-retry` : undefined}
                    type="button"
                    onClick={onRetry}
                    className="button inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                  >
                    <RotateCw className="size-3" /> Tentar novamente
                  </button>
                )}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div
                data-testid={testId ? `${testId}-empty` : undefined}
                className="py-4 text-center text-xs text-muted-foreground"
              >
                {emptyText}
              </div>
            ) : (
              filteredOptions.map((opt, index) => {
                const optSelected = isSelected(opt.value);
                const optDisabled = opt.disabled || isUnavailable(opt.value);
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    id={`${id}-opt-${index}`}
                    key={opt.value}
                    data-testid={testId ? `${testId}-option-${opt.value}` : undefined}
                    type="button"
                    role="option"
                    aria-selected={optSelected}
                    aria-disabled={optDisabled}
                    disabled={optDisabled}
                    tabIndex={optSelected ? 0 : -1}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => choose(opt)}
                    className={cn(
                      'flex min-h-10 w-full items-center justify-between gap-2 rounded-md bg-transparent p-2 text-left text-xs text-foreground transition-colors',
                      isHighlighted && 'bg-secondary',
                      optSelected && 'font-medium',
                      optDisabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    {renderOption ? renderOption(opt, optSelected) : <span>{opt.label}</span>}
                    {optSelected && (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {multiple && max > 0 && (
        <small className="mt-1.5 block text-xs text-muted-foreground">
          {`${selectedValues.length} / ${max} selecionados`}
        </small>
      )}
    </div>
  );
}
