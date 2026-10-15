import { ConfirmDialog } from '@checkpoint/ui-react';
import { ChevronDown } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { errorMessage } from '../../query/errors';
import { useListMutations, useLists } from './lists-store';

type Mode = 'idle' | 'create' | 'rename';

/** Selects the active list and manages list names and actions; `children` are extra items of the actions menu. */
export function ListPicker({
  base,
  current,
  children,
}: {
  base: string;
  current: string | null;
  children?: ReactNode;
}) {
  const screen = base === '/ordem' ? 'queue' : 'settings';
  const navigate = useNavigate();
  const { data: lists = [] } = useLists();
  const { create, rename, remove } = useListMutations();
  const [mode, setMode] = useState<Mode>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = create.isPending || rename.isPending || remove.isPending;
  const currentList = lists.find((l) => l.id === current);
  const editingName = lists.find((l) => l.id === editingId)?.name ?? 'lista';

  const go = (id: string, replace = false) => void navigate(`${base}/${id}`, { replace });
  const start = (next: 'create' | 'rename', id: string | null = current) => {
    setError('');
    setEditingId(next === 'rename' ? id : null);
    setName(next === 'rename' ? (lists.find((l) => l.id === id)?.name ?? '') : '');
    setMode(next);
  };
  const cancel = () => {
    setMode('idle');
    setError('');
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy || mode === 'idle') return;
    setError('');
    try {
      if (mode === 'create') go((await create.mutateAsync(trimmed)).id);
      else if (editingId) await rename.mutateAsync({ id: editingId, name: trimmed });
      setMode('idle');
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function doRemove() {
    setConfirmRemove(false);
    if (!currentList || lists.length < 2) return;
    setError('');
    try {
      await remove.mutateAsync(currentList.id);
      const next = lists.find((l) => l.id !== currentList.id);
      if (next) go(next.id, true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mb-3.5 min-w-0">
      <div
        className="flex min-h-11 items-center gap-2"
        onKeyDown={(e) => e.key === 'Escape' && mode !== 'idle' && !busy && cancel()}
      >
        {mode === 'idle' ? (
          <div className="min-w-0 flex-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  data-testid={`${screen}-list-trigger`}
                  type="button"
                  aria-label="Lista atual"
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 text-base font-semibold"
                >
                  <span className="truncate">{currentList?.name ?? 'Selecionar lista'}</span>
                  <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) max-h-[min(360px,60vh)] overflow-y-auto"
                aria-label="Listas"
              >
                {lists.map((list) => (
                  <div
                    key={list.id}
                    className="flex items-center gap-1"
                    role="group"
                    aria-label={list.name}
                  >
                    <DropdownMenuItem
                      data-testid={`${screen}-list-select-${list.id}`}
                      className="min-h-11 flex-1 justify-between"
                      onSelect={() => list.id !== current && go(list.id)}
                    >
                      <span
                        className={
                          list.id === current ? 'truncate font-semibold text-primary' : 'truncate'
                        }
                      >
                        {list.name}
                      </span>
                      <span aria-hidden="true">{list.id === current ? '✓' : ''}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={`${screen}-list-rename-${list.id}`}
                      className="size-11 justify-center"
                      aria-label={'Renomear ' + list.name}
                      title={'Renomear ' + list.name}
                      onSelect={() => start('rename', list.id)}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z" />
                      </svg>
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={submit}>
            <Input
              data-testid={`${screen}-list-name`}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
              disabled={busy}
              className="h-11 flex-1 text-base"
              aria-label={mode === 'create' ? 'Nome da nova lista' : 'Novo nome de ' + editingName}
              placeholder={mode === 'create' ? 'Nome da nova lista' : 'Novo nome da lista'}
            />
            <Button
              data-testid={`${screen}-list-save`}
              type="submit"
              size="icon"
              className="size-11"
              disabled={busy || !name.trim()}
              aria-label={mode === 'create' ? 'Criar lista' : 'Salvar nome'}
              title={mode === 'create' ? 'Criar lista' : 'Salvar nome'}
            >
              <span aria-hidden="true">✓</span>
            </Button>
            <Button
              data-testid={`${screen}-list-cancel`}
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              onClick={cancel}
              disabled={busy}
              aria-label="Cancelar edição"
              title="Cancelar edição"
            >
              <span aria-hidden="true">×</span>
            </Button>
          </form>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              data-testid={`${screen}-list-actions`}
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              aria-label="Ações da lista"
              title="Ações da lista"
              disabled={mode !== 'idle' || busy}
            >
              <span aria-hidden="true">⋯</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60" aria-label="Ações da lista">
            <DropdownMenuItem
              data-testid={`${screen}-list-rename-current`}
              className="min-h-11"
              disabled={!current}
              onSelect={() => start('rename')}
            >
              Renomear lista
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`${screen}-list-create`}
              className="min-h-11"
              onSelect={() => start('create')}
            >
              Adicionar lista
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid={`${screen}-list-remove`}
              variant="destructive"
              className="min-h-11"
              disabled={!current || lists.length < 2}
              title={lists.length < 2 ? 'Você precisa de ao menos uma lista' : ''}
              onSelect={() => setConfirmRemove(true)}
            >
              Remover lista
            </DropdownMenuItem>
            {children && <DropdownMenuSeparator />}
            {children}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && (
        <span className="mt-2 block text-[13px] text-destructive" role="alert">
          {error}
        </span>
      )}
      <ConfirmDialog
        data-testid={`dialog-list-remove-${current ?? 'none'}`}
        open={confirmRemove}
        destructive
        title={`Apagar a lista "${currentList?.name ?? ''}"?`}
        description="A ordem manual e as regras dela serão perdidas."
        confirmLabel="Apagar"
        onConfirm={() => void doRemove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
