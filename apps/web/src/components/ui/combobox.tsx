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
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  'data-testid'?: string;
  renderOption?: (option: ComboboxOption, selected: boolean) => React.ReactNode;
}

export function Combobox({
  id: customId,
  label,
  options,
  value,
  onValueChange,
  placeholder = 'Selecionar…',
  searchPlaceholder: _searchPlaceholder,
  emptyText = 'Nenhuma opção encontrada',
  disabled = false,
  isLoading = false,
  isError = false,
  onRetry,
  className,
  'data-testid': testId,
  renderOption,
}: ComboboxProps) {
  const generatedId = useId();
  const id = customId || generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const normalizedOptions: ComboboxOption[] = React.useMemo(
    () => options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt)),
    [options],
  );

  const selectedOption = React.useMemo(
    () => normalizedOptions.find((opt) => opt.value === value),
    [normalizedOptions, value],
  );

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) {
      rootRef.current?.querySelector<HTMLButtonElement>('.combobox-trigger')?.focus();
    }
  };

  const openList = () => {
    const idx = normalizedOptions.findIndex((opt) => opt.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

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
    if (normalizedOptions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % normalizedOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + normalizedOptions.length) % normalizedOptions.length,
      );
    } else if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(normalizedOptions.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const option = normalizedOptions[highlightedIndex];
      if (option && !option.disabled) {
        onValueChange?.(option.value);
        close(true);
      }
    }
  }

  const highlightedOption = normalizedOptions[highlightedIndex];
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
          'combobox-trigger flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[7px] border border-border bg-card px-[11px] py-2 text-left text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span id={`${id}-value`} className="truncate">
          {isLoading && !selectedOption ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? `${id}-label` : undefined}
          className="absolute inset-x-0 top-full z-[30] mt-[5px] flex max-h-[280px] flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-lg"
        >
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
            ) : normalizedOptions.length === 0 ? (
              <div
                data-testid={testId ? `${testId}-empty` : undefined}
                className="py-4 text-center text-xs text-muted-foreground"
              >
                {emptyText}
              </div>
            ) : (
              normalizedOptions.map((opt, index) => {
                const isSelected = opt.value === value;
                const isHighlighted = index === highlightedIndex;
                return (
                  <button
                    id={`${id}-opt-${index}`}
                    key={opt.value}
                    data-testid={testId ? `${testId}-option-${opt.value}` : undefined}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={opt.disabled}
                    disabled={opt.disabled}
                    tabIndex={isSelected ? 0 : -1}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => {
                      if (!opt.disabled) {
                        onValueChange?.(opt.value);
                        close(true);
                      }
                    }}
                    className={cn(
                      'flex min-h-10 w-full items-center justify-between gap-2 rounded-md bg-transparent p-2 text-left text-xs text-foreground transition-colors',
                      isHighlighted && 'bg-secondary',
                      isSelected && 'font-medium',
                      opt.disabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    {renderOption ? renderOption(opt, isSelected) : <span>{opt.label}</span>}
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
