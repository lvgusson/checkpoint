import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@checkpoint/ui-react';
import { getAllComponents, type ComponentCategory } from '@/components/registry';

const CATEGORIES: { id: 'all' | ComponentCategory; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'primitives', label: 'Primitives' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'actions', label: 'Actions' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'dialogs', label: 'Dialogs' },
];

export function ComponentCatalogPage() {
  const [selectedCategory, setSelectedCategory] = useState<'all' | ComponentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const allComponents = useMemo(() => getAllComponents(), []);

  const filteredComponents = useMemo(() => {
    return allComponents.filter((comp) => {
      const matchesCategory = selectedCategory === 'all' || comp.category === selectedCategory;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q || comp.name.toLowerCase().includes(q) || comp.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [allComponents, selectedCategory, searchQuery]);

  return (
    <div
      data-testid="component-catalog-page"
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Biblioteca de Componentes<span className="text-primary">.</span>
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Catálogo dos blocos visuais, controles e estados do Checkpoint com playground interativo.
        </p>
      </header>

      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            data-testid="component-search-input"
            type="search"
            placeholder="Buscar por nome ou descrição…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10"
          />
        </div>

        <div
          role="radiogroup"
          aria-label="Filtrar por categoria"
          className="flex flex-wrap items-center gap-1.5"
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`catalog-filter-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                }`}
                aria-pressed={active}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {filteredComponents.length === 0 ? (
        <EmptyState
          title="Nenhum componente encontrado"
          description="Tente ajustar sua busca ou selecionar outra categoria acima."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredComponents.map((comp) => (
            <article
              key={comp.id}
              data-testid={`catalog-card-${comp.id}`}
              className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate">{comp.name}</h2>
                  <span className="mt-1 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground capitalize">
                    {comp.category}
                  </span>
                </div>
                <Link
                  to={`/componentes/${comp.id}`}
                  data-testid={`catalog-link-${comp.id}`}
                  className="button inline-flex shrink-0 items-center gap-1 text-xs py-1 px-2.5 font-medium"
                >
                  Playground ↗
                </Link>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground flex-1">
                {comp.description}
              </p>

              <div className="mt-4 flex min-h-[140px] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-background/50 p-4">
                {comp.render(comp.defaultProps)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
