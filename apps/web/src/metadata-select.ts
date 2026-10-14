import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { metadataPresentation, type MetadataKind } from './metadata-presentation';

let nextSelectId = 0;

@Component({
  selector: 'metadata-select',
  standalone: true,
  template: `
    <span class="select-label" [id]="id + '-label'">{{ label }}</span>
    <button
      type="button"
      class="select-trigger"
      [id]="id + '-trigger'"
      [attr.aria-labelledby]="id + '-label ' + id + '-value'"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? id : null"
      (click)="toggle()"
      (keydown.arrowdown)="openList($event)"
      (keydown.arrowup)="openList($event)"
    >
      <span class="selected-values" [id]="id + '-value'">
        @for (item of selectedValues(); track item) {
          <span
            class="badge metadata-badge"
            [style.--metadata-color]="presentation(kind, item).color"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path [attr.d]="presentation(kind, item).icon" /></svg
            >{{ item }}
          </span>
        } @empty {
          <span class="placeholder">{{
            multiple ? 'Selecionar até ' + max + ' tags' : 'Selecionar'
          }}</span>
        }</span
      ><span aria-hidden="true">⌄</span>
    </button>
    @if (open()) {
      <div
        class="select-options"
        role="listbox"
        tabindex="-1"
        [id]="id"
        [attr.aria-labelledby]="id + '-label'"
        [attr.aria-multiselectable]="multiple ? true : null"
        (keydown)="navigate($event)"
      >
        @for (item of options; track item) {
          <button
            type="button"
            role="option"
            [attr.aria-selected]="selected(item)"
            [attr.aria-disabled]="unavailable(item)"
            [tabIndex]="selected(item) ? 0 : -1"
            (click)="choose(item)"
          >
            <span
              class="badge metadata-badge"
              [style.--metadata-color]="presentation(kind, item).color"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path [attr.d]="presentation(kind, item).icon" /></svg
              >{{ item }} </span
            ><span class="check" aria-hidden="true">{{ selected(item) ? '✓' : '' }}</span>
          </button>
        }
      </div>
    }
    @if (multiple) {
      <small>{{ values.length }} / {{ max }} tags selecionadas</small>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
      margin-top: 17px;
    }
    .select-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
    }
    .select-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 46px;
      padding: 8px 11px;
      margin-top: 8px;
      border: 1px solid var(--border);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      text-align: left;
    }
    .selected-values {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 0;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: normal;
      text-align: left;
      line-height: 1.4;
      font-size: 12px;
    }
    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .badge svg {
      fill: currentColor;
      stroke: none;
    }
    .placeholder,
    small {
      color: var(--muted);
      font-size: 12px;
    }
    small {
      display: block;
      margin-top: 6px;
    }
    .select-options {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 15;
      padding: 6px;
      margin-top: 5px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      box-shadow: 0 8px 24px var(--shadow-mid);
      max-height: 280px;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .select-options button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 44px;
      padding: 8px;
      gap: 8px;
      background: transparent;
      border: 0;
      border-radius: 6px;
      color: var(--text);
      text-align: left;
    }
    .select-options button:hover,
    .select-options button:focus-visible {
      background: var(--surface-2);
    }
    .select-options button[aria-disabled='true'] {
      opacity: 0.45;
    }
    .check {
      color: var(--accent);
      min-width: 16px;
    }
    @media (max-width: 600px) {
      .select-label {
        font-size: 13px;
      }
      .badge {
        font-size: 13px;
      }
    }
  `,
})
export class MetadataSelect {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  @Input() label = '';
  @Input() kind: MetadataKind = 'tag';
  @Input() options: string[] = [];
  @Input() value = '';
  @Input() values: string[] = [];
  @Input() multiple = false;
  @Input() max = 3;
  @Output() valueChange = new EventEmitter<string>();
  @Output() valuesChange = new EventEmitter<string[]>();
  readonly id = 'metadata-select-' + nextSelectId++;
  open = signal(false);
  presentation = metadataPresentation;
  selectedValues() {
    return this.multiple ? this.values : this.value ? [this.value] : [];
  }
  selected(item: string) {
    return this.selectedValues().includes(item);
  }
  unavailable(item: string) {
    return this.multiple && !this.selected(item) && this.values.length >= this.max;
  }
  toggle() {
    if (this.open()) this.close();
    else this.openList();
  }
  openList(event?: Event) {
    event?.preventDefault();
    this.open.set(true);
    setTimeout(() => {
      const options = this.optionElements();
      (
        options.find((item) => item.getAttribute('aria-selected') === 'true') ?? options[0]
      )?.focus();
    });
  }
  close(restoreFocus = true) {
    this.open.set(false);
    if (restoreFocus)
      this.host.nativeElement.querySelector<HTMLButtonElement>('.select-trigger')?.focus();
  }
  choose(item: string) {
    if (this.unavailable(item)) return;
    if (this.multiple)
      this.valuesChange.emit(
        this.selected(item)
          ? this.values.filter((value) => value !== item)
          : [...this.values, item],
      );
    else {
      this.valueChange.emit(item);
      this.close();
    }
  }
  private optionElements() {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }
  navigate(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key === 'Tab') {
      this.close(false);
      return;
    }
    const options = this.optionElements();
    const index = options.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % options.length
        : event.key === 'ArrowUp'
          ? (index - 1 + options.length) % options.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : -1;
    if (next >= 0) {
      event.preventDefault();
      options[next]?.focus();
    }
  }
  @HostListener('document:click', ['$event'])
  outside(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }
}
