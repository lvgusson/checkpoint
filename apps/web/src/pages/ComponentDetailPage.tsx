import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ErrorState } from '@checkpoint/ui-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getComponent, type ComponentEntry } from '@/components/registry';

type SurfaceType = 'default' | 'dark' | 'light' | 'grid';

function generateJsxSnippet(entry: ComponentEntry, props: Record<string, unknown>): string {
  const propStrings: string[] = [];
  let childrenContent: string | null = null;

  for (const def of entry.propDefinitions) {
    const val = props[def.name];
    if (def.name === 'children' && typeof val === 'string') {
      childrenContent = val;
      continue;
    }
    if (def.type === 'boolean') {
      if (val === true) {
        propStrings.push(def.name);
      } else if (val === false) {
        propStrings.push(`${def.name}={false}`);
      }
    } else if (def.type === 'number') {
      propStrings.push(`${def.name}={${val}}`);
    } else if (typeof val === 'string') {
      propStrings.push(`${def.name}="${val}"`);
    }
  }

  const propsJoined = propStrings.length > 0 ? ' ' + propStrings.join(' ') : '';
  if (childrenContent) {
    return `<${entry.name}${propsJoined}>\n  ${childrenContent}\n</${entry.name}>`;
  }
  return `<${entry.name}${propsJoined} />`;
}

function ComponentPlaygroundContent({ component }: { component: ComponentEntry }) {
  const [activeProps, setActiveProps] = useState<Record<string, unknown>>(() => ({
    ...component.defaultProps,
  }));
  const [surface, setSurface] = useState<SurfaceType>('default');

  const updateProp = (name: string, value: unknown) => {
    setActiveProps((prev) => ({ ...prev, [name]: value }));
  };

  const resetToDefaults = () => {
    setActiveProps({ ...component.defaultProps });
  };

  const surfaceClasses: Record<SurfaceType, string> = {
    default: 'bg-card text-card-foreground border-border',
    dark: 'bg-zinc-950 text-zinc-100 border-zinc-800',
    light: 'bg-white text-zinc-900 border-zinc-200',
    grid: 'bg-background text-foreground border-border bg-[radial-gradient(#8884_1px,transparent_1px)] [background-size:16px_16px]',
  };

  const jsxSnippet = generateJsxSnippet(component, activeProps);

  return (
    <div
      data-testid="component-detail-page"
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      {/* Top / Breadcrumb */}
      <nav aria-label="Navegação de migalhas" className="mb-6">
        <Link
          to="/componentes"
          data-testid="back-to-catalog"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar para todos os componentes
        </Link>
      </nav>

      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              {component.name}
            </h1>
            <span className="rounded-full bg-secondary px-3 py-0.5 text-xs font-semibold text-secondary-foreground capitalize">
              {component.category}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{component.description}</p>
        </div>
      </header>

      {/* Main Grid: Viewport on left/center, Controls on right/bottom */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left/Center: Playground viewport */}
        <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Visualização Interativa
            </h2>

            {/* Surface Theme Toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setSurface('default')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  surface === 'default'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Padrão
              </button>
              <button
                type="button"
                onClick={() => setSurface('dark')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  surface === 'dark'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Escuro
              </button>
              <button
                type="button"
                onClick={() => setSurface('light')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  surface === 'light'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Claro
              </button>
              <button
                type="button"
                onClick={() => setSurface('grid')}
                className={`rounded px-2 py-1 font-medium transition-colors ${
                  surface === 'grid'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Grade
              </button>
            </div>
          </div>

          <div
            data-testid="component-viewport"
            className={`flex min-h-[380px] w-full items-center justify-center rounded-xl border p-8 shadow-xs transition-colors duration-200 ${surfaceClasses[surface]}`}
          >
            {component.render(activeProps)}
          </div>

          {/* Live Code Preview Box */}
          <div className="mt-4 flex flex-col gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Código JSX
            </h2>
            <pre className="overflow-x-auto rounded-xl border border-border bg-muted/60 p-4 text-xs font-mono text-foreground leading-relaxed">
              <code>{jsxSnippet}</code>
            </pre>
          </div>
        </div>

        {/* Right/Bottom: Property Controls Panel */}
        <aside
          data-testid="component-props-panel"
          className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-xs lg:col-span-5 xl:col-span-4"
        >
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-base font-bold text-foreground">Propriedades</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={resetToDefaults}
              data-testid="reset-props-button"
              className="text-xs"
            >
              Restaurar padrões
            </Button>
          </div>

          <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
            {component.propDefinitions.map((propDef) => {
              const currentVal = activeProps[propDef.name];

              if (propDef.type === 'boolean') {
                return (
                  <div key={propDef.name} className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`prop-${propDef.name}`}
                      className="text-sm font-medium text-foreground cursor-pointer"
                    >
                      {propDef.label}
                    </label>
                    <input
                      id={`prop-${propDef.name}`}
                      data-testid={`prop-control-${propDef.name}`}
                      type="checkbox"
                      checked={Boolean(currentVal)}
                      onChange={(e) => updateProp(propDef.name, e.target.checked)}
                      className="size-4 cursor-pointer accent-primary"
                    />
                  </div>
                );
              }

              if (propDef.type === 'select') {
                return (
                  <div key={propDef.name} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`prop-${propDef.name}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {propDef.label}
                    </label>
                    <select
                      id={`prop-${propDef.name}`}
                      data-testid={`prop-control-${propDef.name}`}
                      value={String(currentVal ?? propDef.default ?? '')}
                      onChange={(e) => updateProp(propDef.name, e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
                    >
                      {propDef.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (propDef.type === 'number') {
                return (
                  <div key={propDef.name} className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`prop-${propDef.name}`}
                      className="text-sm font-medium text-foreground"
                    >
                      {propDef.label}
                    </label>
                    <Input
                      id={`prop-${propDef.name}`}
                      data-testid={`prop-control-${propDef.name}`}
                      type="number"
                      min={propDef.min}
                      max={propDef.max}
                      value={
                        typeof currentVal === 'number' ? currentVal : (propDef.default as number)
                      }
                      onChange={(e) => updateProp(propDef.name, Number(e.target.value))}
                    />
                  </div>
                );
              }

              return (
                <div key={propDef.name} className="flex flex-col gap-1.5">
                  <label
                    htmlFor={`prop-${propDef.name}`}
                    className="text-sm font-medium text-foreground"
                  >
                    {propDef.label}
                  </label>
                  <Input
                    id={`prop-${propDef.name}`}
                    data-testid={`prop-control-${propDef.name}`}
                    type="text"
                    value={String(currentVal ?? '')}
                    onChange={(e) => updateProp(propDef.name, e.target.value)}
                  />
                </div>
              );
            })}
          </form>
        </aside>
      </div>
    </div>
  );
}

export function ComponentDetailPage() {
  const { name: componentId } = useParams<{ name: string }>();

  const component = useMemo(() => {
    return componentId ? getComponent(componentId) : undefined;
  }, [componentId]);

  if (!component) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16 text-center">
        <ErrorState
          data-testid="component-not-found"
          message={`Componente "${componentId}" não encontrado na biblioteca.`}
        />
        <div className="mt-4">
          <Link to="/componentes" className="button">
            ← Voltar para todos os componentes
          </Link>
        </div>
      </div>
    );
  }

  return <ComponentPlaygroundContent key={component.id} component={component} />;
}
