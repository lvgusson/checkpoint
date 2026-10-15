import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes, ReactNode } from 'react';

export interface MoveIntent {
  id: string;
  fromIndex: number;
  toIndex: number;
}

export interface SortableItemState {
  index: number;
  isDragging: boolean;
  /** Spread on the drag handle element (a <button> is recommended): carries listeners, ARIA and keyboard support. */
  handleProps: HTMLAttributes<HTMLElement>;
}

/** pt-BR screen-reader texts; pass your own `accessibility` copy to localize differently. */
const instructions: ScreenReaderInstructions = {
  draggable:
    'Para reordenar, pressione espaço ou Enter. Use as setas para mover, espaço para soltar e Esc para cancelar.',
};
const announcements: Announcements = {
  onDragStart: ({ active }) => `Item ${active.id} selecionado.`,
  onDragOver: ({ active, over }) =>
    over ? `Item ${active.id} movido para a posição de ${over.id}.` : undefined,
  onDragEnd: ({ active, over }) =>
    over ? `Item ${active.id} solto na posição de ${over.id}.` : `Item ${active.id} solto.`,
  onDragCancel: ({ active }) => `Movimento do item ${active.id} cancelado.`,
};

interface Props<T> {
  items: T[];
  getId(item: T): string;
  renderItem(item: T, state: SortableItemState): ReactNode;
  /**
   * Called once per completed drag. The list never reorders itself: the parent decides, persists
   * and re-renders `items` in the new order (or ignores the intent).
   */
  onMoveIntent(intent: MoveIntent): void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

/** Vertical sortable list with pointer (mouse and touch via the handle's touch-action: none) and keyboard (Space, arrows) sensors. */
export function SortableList<T>({
  items,
  getId,
  renderItem,
  onMoveIntent,
  disabled,
  className,
  'aria-label': label,
  'data-testid': testId,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const fromIndex = ids.indexOf(String(active.id));
    const toIndex = ids.indexOf(String(over.id));
    if (fromIndex >= 0 && toIndex >= 0) onMoveIntent({ id: String(active.id), fromIndex, toIndex });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: instructions, announcements }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul
          data-testid={testId}
          className={className}
          aria-label={label}
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {items.map((item, index) => (
            <Row
              key={ids[index]}
              id={ids[index]!}
              index={index}
              disabled={disabled}
              render={(s) => renderItem(item, s)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  id,
  index,
  disabled,
  render,
}: {
  id: string;
  index: number;
  disabled?: boolean;
  render: (s: SortableItemState) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 1 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {render({
        index,
        isDragging,
        handleProps: {
          ...attributes,
          ...listeners,
          style: { touchAction: 'none', cursor: disabled ? undefined : 'grab' },
        },
      })}
    </li>
  );
}
