import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA and Apple Touch Icon configuration', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const webDir = path.resolve(repoRoot, 'apps/web');
  const publicDir = path.resolve(webDir, 'public');
  const indexHtmlPath = path.resolve(webDir, 'index.html');
  const manifestPath = path.resolve(publicDir, 'manifest.webmanifest');

  it('includes ?v=2 cache buster on all icon links in index.html', () => {
    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    expect(html).toContain('<link rel="icon" href="/favicon.ico?v=2" sizes="any" />');
    expect(html).toContain('<link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml" />');
    expect(html).toContain(
      '<link rel="icon" href="/favicon-32.png?v=2" sizes="32x32" type="image/png" />',
    );
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />');
  });

  it('lists PNG icons first before any SVG in manifest.webmanifest', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(Array.isArray(manifest.icons)).toBe(true);
    const icons = manifest.icons as Array<{ src: string; type: string }>;

    const firstSvgIndex = icons.findIndex((i) => i.src.endsWith('.svg'));
    const pngIndices = icons
      .map((i, idx) => (i.src.endsWith('.png') ? idx : -1))
      .filter((idx) => idx !== -1);

    expect(pngIndices.length).toBeGreaterThan(0);
    expect(firstSvgIndex).toBeGreaterThan(-1);

    for (const pngIdx of pngIndices) {
      expect(pngIdx).toBeLessThan(firstSvgIndex);
    }
  });

  it('validates raster icons and ensures apple-touch-icon is solid without transparency', () => {
    const appleTouchBuf = fs.readFileSync(path.resolve(publicDir, 'apple-touch-icon.png'));
    const icon192Buf = fs.readFileSync(path.resolve(publicDir, 'icon-192.png'));
    const icon512Buf = fs.readFileSync(path.resolve(publicDir, 'icon-512.png'));
    const favicon32Buf = fs.readFileSync(path.resolve(publicDir, 'favicon-32.png'));
    const faviconIcoBuf = fs.readFileSync(path.resolve(publicDir, 'favicon.ico'));

    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(appleTouchBuf.subarray(0, 8)).toEqual(pngSignature);
    expect(icon192Buf.subarray(0, 8)).toEqual(pngSignature);
    expect(icon512Buf.subarray(0, 8)).toEqual(pngSignature);
    expect(favicon32Buf.subarray(0, 8)).toEqual(pngSignature);

    expect(faviconIcoBuf.readUInt16LE(0)).toBe(0);
    expect(faviconIcoBuf.readUInt16LE(2)).toBe(1);
    expect(faviconIcoBuf.readUInt16LE(4)).toBe(1);
    expect(faviconIcoBuf.readUInt8(6)).toBe(32);
    expect(faviconIcoBuf.readUInt8(7)).toBe(32);
    expect(faviconIcoBuf.subarray(22)).toEqual(favicon32Buf);

    expect(appleTouchBuf.readUInt32BE(16)).toBe(180);
    expect(appleTouchBuf.readUInt32BE(20)).toBe(180);
    expect(icon192Buf.readUInt32BE(16)).toBe(192);
    expect(icon192Buf.readUInt32BE(20)).toBe(192);
    expect(icon512Buf.readUInt32BE(16)).toBe(512);
    expect(icon512Buf.readUInt32BE(20)).toBe(512);
    expect(favicon32Buf.readUInt32BE(16)).toBe(32);
    expect(favicon32Buf.readUInt32BE(20)).toBe(32);
  });
});
