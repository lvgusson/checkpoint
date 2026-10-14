import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { MetadataBadge } from './MetadataBadge';
import type { MetadataKind } from './presentation';

type Common = { label: string; kind: MetadataKind; options: string[] };
type Props =
  | (Common & { multiple?: false; value: string; onValueChange(value: string): void })
  | (Common & {
      multiple: true;
      values: string[];
      max?: number;
      onValuesChange(values: string[]): void;
    });

/** Listbox of metadata badges; single or multiple (limited by `max`). Keyboard: arrows, Home/End, Escape, Tab. */
export function MetadataSelect(props: Props) {
  const { label, kind, options } = props;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const max = props.multiple ? (props.max ?? 3) : 0;
  const selectedValues = props.multiple ? props.values : props.value ? [props.value] : [];
  const selected = (item: string) => selectedValues.includes(item);
  const unavailable = (item: string) =>
    props.multiple === true && !selected(item) && props.values.length >= max;
  const optionElements = () =>
    Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) root.current?.querySelector<HTMLButtonElement>('.select-trigger')?.focus();
  };
  // Focus the selected (or first) option when the list opens.
  useEffect(() => {
    if (!open) return;
    const items = optionElements();
    (items.find((o) => o.getAttribute('aria-selected') === 'true') ?? items[0])?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close(false);
    document.addEventListener('click', outside);
    return () => document.removeEventListener('click', outside);
  }, [open]);

  function choose(item: string) {
    if (unavailable(item)) return;
    if (props.multiple)
      props.onValuesChange(
        selected(item) ? props.values.filter((v) => v !== item) : [...props.values, item],
      );
    else {
      props.onValueChange(item);
      close();
    }
  }
  function navigate(event: React.KeyboardEvent) {
    if (event.key === 'Escape') return (event.preventDefault(), close());
    if (event.key === 'Tab') return close(false);
    const items = optionElements();
    const index = items.indexOf(event.target as HTMLButtonElement);
    const next = {
      ArrowDown: (index + 1) % items.length,
      ArrowUp: (index - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  }
  const openList = (event: React.KeyboardEvent) => (event.preventDefault(), setOpen(true));

  return (
    <div ref={root} className="relative mt-[17px] block min-w-0">
      <span className="block text-[11px] font-semibold max-sm:text-[13px]" id={id + '-label'}>
        {label}
      </span>
      <button
        type="button"
        className="select-trigger mt-2 flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[7px] border border-border bg-card px-[11px] py-2 text-left text-foreground"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => (e.key === 'ArrowDown' || e.key === 'ArrowUp') && openList(e)}
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
              {props.multiple ? `Selecionar até ${max} tags` : 'Selecionar'}
            </span>
          )}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          className="absolute inset-x-0 top-full z-[15] mt-[5px] max-h-[280px] overflow-auto overscroll-contain rounded-[10px] border border-border bg-card p-1.5 shadow-lg"
          role="listbox"
          tabIndex={-1}
          id={id}
          aria-labelledby={id + '-label'}
          aria-multiselectable={props.multiple || undefined}
          onKeyDown={navigate}
        >
          {options.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={selected(item)}
              aria-disabled={unavailable(item)}
              tabIndex={selected(item) ? 0 : -1}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-2 rounded-md bg-transparent p-2 text-left text-foreground hover:bg-secondary focus-visible:bg-secondary',
                unavailable(item) && 'opacity-45',
              )}
              onClick={() => choose(item)}
            >
              <MetadataBadge
                kind={kind}
                value={item}
                className="!whitespace-normal text-left text-xs leading-snug"
              />
              <span className="min-w-4 text-primary" aria-hidden="true">
                {selected(item) ? '✓' : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      {props.multiple && (
        <small className="mt-1.5 block text-xs text-muted-foreground">
          {props.values.length} / {max} tags selecionadas
        </small>
      )}
    </div>
  );
}
