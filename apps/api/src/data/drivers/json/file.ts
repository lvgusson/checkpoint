// The one place that reads and writes the local JSON files used by the json drivers.
// Writes are serialized (one at a time, in call order) and atomic (temp file + rename).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class JsonFile {
  private path: string | null;
  private queue: Promise<void> = Promise.resolve();
  /** Sem `path`, nada é lido nem gravado: o driver fica só em memória. */
  constructor(path: string | null) {
    this.path = path;
  }
  /** Conteúdo parseado, ou undefined se não há arquivo. */
  async read(): Promise<unknown> {
    if (!this.path) return undefined;
    try {
      return JSON.parse(await readFile(this.path, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return undefined;
    }
  }
  /** Grava o estado de agora (o snapshot é tirado na chamada) depois das gravações pendentes. */
  async write(data: unknown): Promise<void> {
    const path = this.path;
    if (!path) return;
    const snapshot = JSON.stringify(data, null, 2);
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path + '.tmp', snapshot);
        await rename(path + '.tmp', path);
      });
    await this.queue;
  }
}
