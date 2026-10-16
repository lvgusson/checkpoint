import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Loader, registerLoaderArt } from './Loader';

const html = (node: React.ReactNode) => renderToString(node);

describe('Loader', () => {
  it('is a polite status region named by its label', () => {
    const out = html(<Loader label="Carregando jogos…" data-testid="loader-test" />);
    expect(out).toContain('role="status"');
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain('aria-label="Carregando jogos…"');
    expect(out).toContain('data-testid="loader-test"');
    expect(out).toContain('Carregando jogos…</span>');
  });

  it('draws the art above the label by default and beside it when inline', () => {
    const out = html(<Loader label="Aguarde" art={<b id="art">x</b>} />);
    expect(out.indexOf('id="art"')).toBeLessThan(out.indexOf('Aguarde</span>'));
    expect(out).toContain('ckl--stacked');
    expect(html(<Loader layout="inline" label="Aguarde" />)).toContain('ckl--inline');
  });

  it('shows the default spinner when no art is given', () => {
    expect(html(<Loader />)).toContain('class="ckl__spinner"');
  });

  it('renders src as an image with empty alt', () => {
    const out = html(<Loader src="/loader.svg" />);
    expect(out).toContain('<img');
    expect(out).toContain('src="/loader.svg"');
    expect(out).toContain('alt=""');
    expect(out).not.toContain('class="ckl__spinner"');
  });

  it('looks up a registered variant, as a node or a component, and falls back to the spinner', () => {
    registerLoaderArt('node-art', <i id="from-node" />);
    registerLoaderArt('fn-art', ({ size }) => <u id={`from-fn-${size}`} />);
    expect(html(<Loader variant="node-art" />)).toContain('id="from-node"');
    expect(html(<Loader variant="fn-art" size={30} />)).toContain('id="from-fn-30"');
    expect(html(<Loader variant="unknown-art" />)).toContain('class="ckl__spinner"');
  });

  it('prefers art over src over variant, and sizes the art box', () => {
    registerLoaderArt('lost', <i id="variant" />);
    const out = html(<Loader art={<b id="art" />} src="/x.svg" variant="lost" size="lg" />);
    expect(out).toContain('id="art"');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('id="variant"');
    expect(out).toContain('width:64px');
    expect(html(<Loader size={20} />)).toContain('width:20px');
  });

  it('supports the block and screen fills and omits the label element without a label', () => {
    expect(html(<Loader fill="screen" />)).toContain('ckl--screen');
    expect(html(<Loader fill="block" />)).toContain('ckl--block');
    expect(html(<Loader />)).not.toContain('class="ckl__label"');
  });

  it('respects reduced motion in its styles', () => {
    expect(html(<Loader />)).toContain('prefers-reduced-motion');
  });
});
