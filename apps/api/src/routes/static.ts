// Serve o app web compilado (apps/web/dist); qualquer caminho desconhecido cai no index.html.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { ContentType, type RouteResult } from './http.ts';

const base = resolve(fileURLToPath(new URL('../../', import.meta.url)), '../web/dist');
const mime: Record<string, string> = {
  '.html': ContentType.HtmlUtf8,
  '.js': ContentType.JavaScript,
  '.css': ContentType.Css,
  '.svg': ContentType.Svg,
  '.ico': ContentType.Icon,
  '.png': ContentType.Png,
  '.webmanifest': ContentType.WebManifest,
};

export async function staticRoute(path: string): Promise<RouteResult> {
  let target = resolve(base, '.' + decodeURIComponent(path));
  if (!target.startsWith(base + sep)) target = resolve(base, 'index.html');
  let content;
  try {
    content = await readFile(target);
  } catch {
    target = resolve(base, 'index.html');
    content = await readFile(target).catch(() =>
      Buffer.from(
        '<!doctype html><html lang="pt-BR"><head><title>Checkpoint</title></head><body><div id="root"></div></body></html>',
      ),
    );
  }
  return { raw: content, contentType: mime[extname(target)] ?? ContentType.OctetStream };
}
