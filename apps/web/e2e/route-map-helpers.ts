import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export interface FileCredentials {
  email?: string;
  password?: string;
  bypassSecret?: string;
}

/**
 * Reads credentials safely from the git-ignored playwrite-credentials.json file.
 * Returns empty object if missing or unparseable.
 */
export function readFileCredentials(): FileCredentials {
  try {
    return JSON.parse(
      fs.readFileSync(new URL('../../../playwrite-credentials.json', import.meta.url), 'utf8'),
    );
  } catch {
    return {};
  }
}

/**
 * Resolves the bypass secret with priority:
 * 1. Environment variable VERCEL_AUTOMATION_BYPASS_SECRET
 * 2. File credential bypassSecret
 */
export function resolveBypassSecret(envSecret?: string, fileSecret?: string): string | undefined {
  const fromEnv = envSecret?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = fileSecret?.trim();
  if (fromFile) return fromFile;
  return undefined;
}

/**
 * Checks whether the given URL points to a local environment.
 */
export function isLocalhost(urlStr?: string): boolean {
  if (!urlStr) return true;
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]'
    );
  } catch {
    const lower = urlStr.toLowerCase();
    return lower.includes('localhost') || lower.includes('127.0.0.1');
  }
}

/**
 * Returns Vercel protection bypass headers if BASE_URL is not localhost
 * and a bypass secret exists. Otherwise returns undefined.
 */
export function getBypassHeaders(
  baseURL?: string,
  bypassSecret?: string,
): Record<string, string> | undefined {
  if (!baseURL || isLocalhost(baseURL) || !bypassSecret) {
    return undefined;
  }
  return {
    'x-vercel-protection-bypass': bypassSecret,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

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

  /**
   * Reads window.__timingSummary() from the page, logs summary table,
   * and writes the summary to a JSON file in test-results/.
   */
  async collectSummary(page: Page, targetPath?: string): Promise<Record<string, unknown> | null> {
    let summary: Record<string, unknown> | null;
    try {
      summary = await page.evaluate(() => {
        const win = window as unknown as { __timingSummary?: () => Record<string, unknown> };
        return win.__timingSummary ? win.__timingSummary() : null;
      });
    } catch {
      summary = null;
    }

    if (summary) {
      console.log('\n=== [TIMING SUMMARY] window.__timingSummary() ===');
      console.table(summary);

      const dest =
        targetPath ||
        fileURLToPath(new URL('../test-results/route-map-summary.json', import.meta.url));
      const dir = path.dirname(dest);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(dest, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`Saved timing summary to ${dest}`);
    }
    return summary;
  }

  getRecords(): StepTimingRecord[] {
    return this.records;
  }
}
