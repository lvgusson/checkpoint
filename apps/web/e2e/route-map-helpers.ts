import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export interface RequestTiming {
  requestId: string;
  method: string;
  path: string;
  status: number;
  totalMs: number;
  handlerMs: number | null;
  networkMs: number | null;
  arrivalMs: number | null;
}

export interface StepTimingRecord {
  stepId: string;
  route: string;
  timestamp: string;
  timings: RequestTiming[];
}

export class TimingCollector {
  private seenIds = new Set<string>();
  private records: StepTimingRecord[] = [];

  /**
   * Reads window.__timings from the current page, prints a formatted table,
   * and records new timings for this step.
   */
  async collect(page: Page, stepId: string, route: string): Promise<RequestTiming[]> {
    let rawTimings: RequestTiming[];
    try {
      rawTimings = await page.evaluate(() => {
        const win = window as unknown as { __timings?: RequestTiming[] };
        return win.__timings ? [...win.__timings] : [];
      });
    } catch {
      // Page might be navigating or closed
      rawTimings = [];
    }

    const newTimings = rawTimings.filter((t) => !this.seenIds.has(t.requestId));
    for (const t of newTimings) {
      this.seenIds.add(t.requestId);
    }

    const record: StepTimingRecord = {
      stepId,
      route,
      timestamp: new Date().toISOString(),
      timings: newTimings,
    };
    this.records.push(record);

    console.log(`\n=== [TIMING] Step: ${stepId} (${route}) ===`);
    if (newTimings.length === 0) {
      console.log('No new API timings recorded.');
    } else {
      const tableData = newTimings.map((t) => ({
        'route/call': `${t.method} ${t.path} (${t.status})`,
        totalMs: t.totalMs,
        handlerMs: t.handlerMs ?? '—',
        networkMs: t.networkMs ?? '—',
      }));
      console.table(tableData);
    }

    return newTimings;
  }

  /**
   * Writes all accumulated step timings to a JSON file.
   */
  save(targetPath?: string): void {
    const dest =
      targetPath ||
      fileURLToPath(new URL('../test-results/route-map-timings.json', import.meta.url));

    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(dest, JSON.stringify(this.records, null, 2), 'utf8');
    console.log(`\nSaved ${this.records.length} step timing records to ${dest}`);
  }

  getRecords(): StepTimingRecord[] {
    return this.records;
  }
}
