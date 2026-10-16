import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AppLoader } from './AppLoader';

const html = (node: React.ReactNode) => renderToString(node);

describe('AppLoader', () => {
  it('renders bonfire sword art by default for stacked loaders', () => {
    const out = html(<AppLoader data-testid="loader-default" label="Carregando…" />);
    expect(out).toContain('sword-loader-svg');
    expect(out).not.toContain('class="ckl__spinner"');
    expect(out).toContain('data-testid="loader-default"');
    expect(out).toContain('Carregando…');
  });

  it('renders standard circular spinner when layout="inline"', () => {
    const out = html(<AppLoader layout="inline" size="sm" label="Aguarde…" />);
    expect(out).toContain('class="ckl__spinner"');
    expect(out).not.toContain('sword-loader-svg');
  });

  it('renders standard circular spinner when explicitly passed variant="spinner"', () => {
    const out = html(<AppLoader variant="spinner" label="Aguarde…" />);
    expect(out).toContain('class="ckl__spinner"');
    expect(out).not.toContain('sword-loader-svg');
  });

  it('renders bonfire sword art when explicitly passed variant="sword"', () => {
    const out = html(
      <AppLoader variant="sword" data-testid="loader-sword" label="Carregando jogos…" />,
    );
    expect(out).toContain('sword-loader-svg');
    expect(out).not.toContain('class="ckl__spinner"');
    expect(out).toContain('data-testid="loader-sword"');
  });

  it('preserves layout, size and fill options', () => {
    const inline = html(<AppLoader layout="inline" size="sm" label="salvando…" />);
    expect(inline).toContain('ckl--inline');
    expect(inline).toContain('width:20px');

    const block = html(<AppLoader fill="block" variant="sword" />);
    expect(block).toContain('ckl--block');
    expect(block).toContain('sword-loader-svg');
  });
});
