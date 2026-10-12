import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import { changedPaths, git, snapshot } from './git-state.mjs';

const ARCHITECTURE = 'AI/Architecture/';
const ARCHIVE = 'AI/Deprecate/';
const documentTypes = new Set([
  'architecture-root',
  'module',
  'component',
  'integration',
  'domain',
]);
const text = (files, name) => files.get(name)?.toString('utf8');
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const hasPath = (files, name) =>
  files.has(name) ||
  [...files.keys()].some((entry) => entry.startsWith(name.replace(/\/$/, '') + '/'));
const isCurrent = (name) => name.startsWith(ARCHITECTURE) && name.endsWith('.md');
const isIndex = (name) => name.endsWith('-index.md');
const isImplementation = (name) =>
  (/^(api\/|web\/|shared\/|db\/|supabase\/|scripts\/)/.test(name) && !name.endsWith('.md')) ||
  /^(package(-lock)?\.json|angular\.json|vercel\.json|tsconfig.*\.json|eslint\.config\.js|\.env\.example)$/.test(
    name,
  );

export function matches(pattern, name) {
  const expression = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((token) => token.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${expression}$`).test(name);
}

function metadata(body) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
  if (!match) throw new Error('Missing YAML frontmatter');
  const parsed = parseDocument(match[1], { uniqueKeys: true });
  if (parsed.errors.length) throw new Error(parsed.errors.map((error) => error.message).join('; '));
  const value = parsed.toJS();
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Metadata must be a mapping');
  return value;
}

function unfenced(body) {
  return body.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[^\n]*(?=\n|$)/g, '$1');
}

export function links(body, from) {
  const clean = unfenced(body);
  const targets = [];
  const expressions = [
    /!?\[[^\]]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g,
    /^\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm,
  ];
  for (const expression of expressions) {
    for (const match of clean.matchAll(expression)) {
      const value = match[1] || match[2];
      if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('#')) continue;
      const [raw, anchor] = value.split('#');
      const decoded = decodeURIComponent(raw.split('?')[0]);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded));
      targets.push({ target, anchor, value });
    }
  }
  return targets;
}

function logicalBlocks(body) {
  const content = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const headings = [...content.matchAll(/^##? [^\r\n]+\r?\n/gm)];
  if (!headings.length) return [content];
  return headings.map((heading, index) =>
    content.slice(heading.index, headings[index + 1]?.index ?? content.length),
  );
}

export function impactedOwners(files, changes = [], baseFiles = null) {
  const maps = [files, baseFiles]
    .filter(Boolean)
    .map((state) => JSON.parse(text(state, 'AI/validation/ownership.json') || '{"rules":[]}'));
  const selected = maps
    .flatMap((ownership) => ownership.rules)
    .filter((rule) =>
      changes.some(
        (change) =>
          matches(rule.pattern, change.path) ||
          (change.oldPath && matches(rule.pattern, change.oldPath)),
      ),
    );
  return {
    areas: [...new Set(selected.flatMap((rule) => rule.areas || []))].sort(),
    domains: [...new Set(selected.flatMap((rule) => rule.domains || []))].sort(),
    documents: [...new Set(selected.flatMap((rule) => rule.documents || []))].sort(),
  };
}

export function archiveEntries(body) {
  const starts = [];
  let offset = 0;
  let fence = null;
  for (const line of body.match(/[^\n]*\n|[^\n]+$/g) || []) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        /^\s*(?:`+|~+)\s*$/.test(line)
      )
        fence = null;
    } else if (!fence && /^## DEP-/.test(line)) starts.push(offset);
    offset += line.length;
  }
  return starts.map((start, index) => {
    const block = body.slice(start, starts[index + 1] ?? body.length);
    const id = /^## (DEP-\d{8}-[a-zA-Z0-9-]+)\r?\n/.exec(block)?.[1];
    const fields = {};
    const repeatedFields = [];
    const prefix = block.split('### Exact previous content')[0];
    for (const match of prefix.matchAll(/^- ([A-Za-z ]+):\s*(.+)\r?$/gm)) {
      if (match[1] in fields) repeatedFields.push(match[1]);
      fields[match[1]] = match[2].trim().replace(/^`|`$/g, '');
    }
    const opening = /### Exact previous content\r?\n\r?\n(`{3,}|~{3,})(?:markdown|md)?\r?\n/.exec(
      block,
    );
    let content = null;
    if (opening) {
      const after = opening.index + opening[0].length;
      const closing = new RegExp(`^${opening[1]}[${opening[1][0]}]*[ \\t]*\\r?$`, 'm').exec(
        block.slice(after),
      );
      if (closing) content = block.slice(after, after + closing.index);
    }
    return { id, fields, repeatedFields, content, block };
  });
}

export function validateSnapshot(
  files,
  { baseFiles = null, changes = [], requireCoverage = true } = {},
) {
  const errors = [];
  const warnings = [];
  const documents = [];
  const ids = new Map();
  const graph = new Map();
  const fail = (code, name, message) => errors.push({ code, path: name, message });
  const active = [...files.keys()].filter(isCurrent);
  for (const name of active) {
    const body = text(files, name);
    if (/Arquitecture|arquitecture|data-base|infra-arquitecture/.test(name))
      fail('naming', name, 'Use canonical English architecture names');
    if (!isIndex(name)) {
      try {
        const meta = metadata(body);
        const required =
          meta.type === 'domain'
            ? [
                'id',
                'title',
                'type',
                'status',
                'classification',
                'last_verified',
                'source_paths',
                'related_domains',
              ]
            : [
                'id',
                'title',
                'type',
                'area',
                'status',
                'owner',
                'last_verified',
                'source_paths',
                'related_domains',
                'tags',
              ];
        for (const key of required) if (!(key in meta)) fail('metadata', name, `Missing ${key}`);
        for (const key of [
          'id',
          'title',
          'type',
          'status',
          ...(meta.type === 'domain' ? ['classification'] : ['area', 'owner']),
        ])
          if (typeof meta[key] !== 'string' || !meta[key].trim())
            fail('metadata', name, `${key} must be a nonempty string`);
        if (!documentTypes.has(meta.type)) fail('metadata', name, `Invalid type ${meta.type}`);
        if (meta.status !== 'active')
          fail('metadata', name, 'Current document status must be active');
        if (
          meta.type === 'domain' &&
          !['core', 'supporting', 'generic', 'unknown'].includes(meta.classification)
        )
          fail('metadata', name, 'Invalid domain classification');
        if (typeof meta.id !== 'string' || !/^(architecture|domain)\.[a-z0-9.-]+$/.test(meta.id))
          fail('metadata', name, 'Invalid stable ID');
        if (ids.has(meta.id)) fail('id', name, `Duplicate ID also used by ${ids.get(meta.id)}`);
        ids.set(meta.id, name);
        const verifiedDate = new Date(String(meta.last_verified));
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.last_verified)) ||
          Number.isNaN(verifiedDate.getTime()) ||
          verifiedDate.toISOString().slice(0, 10) !== String(meta.last_verified)
        )
          fail('metadata', name, 'Invalid verification date');
        for (const key of [
          'source_paths',
          'related_domains',
          ...(meta.type === 'domain' ? [] : ['tags']),
        ])
          if (!Array.isArray(meta[key]) || meta[key].some((value) => typeof value !== 'string'))
            fail('metadata', name, `${key} must contain strings`);
        for (const source of Array.isArray(meta.source_paths) ? meta.source_paths : []) {
          if (source.startsWith('/') || source.includes('..') || !hasPath(files, source))
            fail('source', name, `Missing or invalid source path ${source}`);
        }
        const count = meta.type === 'domain' ? 14 : 10;
        for (let section = 1; section <= count; section++)
          if (!new RegExp(`^## ${section}\\. `, 'm').test(body))
            fail('schema', name, `Missing numbered section ${section}`);
        if (meta.type === 'architecture-root' && body.split('\n').length > 150)
          warnings.push({ path: name, message: 'Root exceeds preferred 150 lines' });
        documents.push({ path: name, metadata: meta });
      } catch (error) {
        fail('metadata', name, error.message);
      }
    }
  }
  const domainIds = new Set(
    documents
      .filter((document) => document.metadata.type === 'domain')
      .map((document) => document.metadata.id),
  );
  for (const document of documents) {
    for (const id of document.metadata.related_domains || [])
      if (!domainIds.has(id)) fail('domain', document.path, `Unresolved related domain ${id}`);
  }
  const navigable = [...files.keys()].filter(
    (name) =>
      name.endsWith('.md') &&
      (name.startsWith('AI/') || name === 'AGENTS.md') &&
      !name.startsWith(ARCHIVE) &&
      !name.startsWith('AI/investigation/'),
  );
  for (const name of navigable) {
    let targets;
    try {
      targets = links(text(files, name), name);
    } catch (error) {
      fail('link', name, error.message);
      continue;
    }
    graph.set(
      name,
      targets.map((link) => link.target),
    );
    for (const { target, anchor, value } of targets) {
      if (target.startsWith('../') || !hasPath(files, target)) {
        fail('link', name, `Unresolved link ${value}`);
        continue;
      }
      if (anchor && target.endsWith('.md')) {
        const headingIds = [
          ...unfenced(text(files, target) || '').matchAll(/^#{1,6}\s+(.+)$/gm),
        ].map((match) =>
          match[1]
            .trim()
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s_-]/gu, '')
            .replace(/\s/g, '-'),
        );
        if (!headingIds.includes(decodeURIComponent(anchor)))
          fail('anchor', name, `Missing heading anchor ${value}`);
      }
    }
  }
  const reached = new Set();
  const visit = (name) => {
    if (reached.has(name)) return;
    reached.add(name);
    for (const child of graph.get(name) || []) visit(child);
  };
  visit('AI/main-entry.md');
  for (const name of active)
    if (!reached.has(name)) fail('orphan', name, 'Unreachable from AI/main-entry.md');
  let ownership;
  let impact = { areas: [], domains: [], documents: [] };
  try {
    ownership = JSON.parse(text(files, 'AI/validation/ownership.json') || 'null');
    if (!ownership || ownership.version !== 1 || !Array.isArray(ownership.rules))
      throw new Error('Ownership index requires version 1 and rules');
    for (const rule of ownership.rules) {
      if (
        typeof rule.pattern !== 'string' ||
        !Array.isArray(rule.areas) ||
        !Array.isArray(rule.documents) ||
        !Array.isArray(rule.domains) ||
        !rule.documents.length
      )
        throw new Error('Each rule requires pattern, areas, documents and domains');
      for (const name of rule.documents)
        if (!files.has(name) || !isCurrent(name))
          fail('ownership', name, 'Ownership target must be current architecture document');
      for (const id of rule.domains)
        if (!domainIds.has(id))
          fail('ownership', 'AI/validation/ownership.json', `Unknown domain ${id}`);
    }
    impact = impactedOwners(files, changes, baseFiles);
    if (requireCoverage)
      for (const change of changes) {
        if (
          isImplementation(change.path) &&
          !ownership.rules.some(
            (rule) =>
              matches(rule.pattern, change.path) ||
              (change.oldPath && matches(rule.pattern, change.oldPath)),
          )
        )
          fail(
            'coverage',
            change.path,
            'Changed implementation has no architectural ownership mapping',
          );
      }
  } catch (error) {
    fail('ownership', 'AI/validation/ownership.json', error.message);
  }
  if (baseFiles) {
    for (const [name, before] of baseFiles) {
      if (!name.startsWith(ARCHIVE)) continue;
      const after = files.get(name);
      if (
        !after ||
        after.length < before.length ||
        !after.subarray(0, before.length).equals(before)
      )
        fail('archive', name, 'Existing archive must remain an exact byte prefix');
    }
    const additions = [...files.entries()]
      .filter(([name]) => name.startsWith(ARCHIVE))
      .flatMap(([name, body]) =>
        archiveEntries(body.subarray(baseFiles.get(name)?.length || 0).toString('utf8')).map(
          (entry) => ({ name, ...entry }),
        ),
      );
    const currentBodies = [...files.keys()].filter(isCurrent).map((name) => text(files, name));
    for (const [name, before] of baseFiles) {
      if (!isCurrent(name) || isIndex(name)) continue;
      const oldBody = before.toString('utf8');
      if (files.get(name)?.equals(before)) continue;
      const removed = !files.has(name);
      const blocks = removed ? [oldBody] : logicalBlocks(oldBody);
      for (const block of blocks) {
        if (
          !block.trim() ||
          currentBodies.some((body) => normalize(body).includes(normalize(block)))
        )
          continue;
        const archive = additions.find(
          (entry) => entry.content?.includes(block) && entry.fields.Source === name,
        );
        if (!archive)
          fail(
            'deprecation',
            name,
            'Replaced logical block is missing exact previous content in a new archive entry',
          );
      }
    }
  }
  const historicalIds = new Set();
  const requiredHistoryFields = [
    'Date',
    'Source',
    'Original document ID',
    'Original section',
    'Reason',
    'Replacement',
    'Related code',
    'Change reference',
  ];
  for (const [name, bytes] of files) {
    if (!name.startsWith(ARCHIVE) || !name.endsWith('.md')) continue;
    for (const entry of archiveEntries(bytes.toString('utf8'))) {
      if (!entry.id || historicalIds.has(entry.id))
        fail('archive-metadata', name, 'Deprecation IDs must be valid and globally unique');
      historicalIds.add(entry.id);
      if (entry.repeatedFields.length)
        fail(
          'archive-metadata',
          name,
          `Repeated deprecation fields: ${entry.repeatedFields.join(', ')}`,
        );
      for (const field of requiredHistoryFields)
        if (!entry.fields[field])
          fail('archive-metadata', name, `Missing deprecation field ${field}`);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(
          entry.fields.Date || '',
        ) ||
        Number.isNaN(Date.parse(entry.fields.Date))
      )
        fail('archive-metadata', name, 'Deprecation date must include time and timezone');
      if (entry.content === null)
        fail('archive-metadata', name, 'Missing fenced exact previous content');
    }
  }
  return { status: errors.length ? 'FAIL' : 'PASS', errors, warnings, documents, impact };
}

export function runValidation(repo, args = []) {
  const staged = args.includes('--staged');
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const head = staged ? 'INDEX' : value('--head') || 'WORKTREE';
  let base = value('--base');
  if (staged && !base) {
    try {
      base = git(repo, ['rev-parse', 'HEAD']).trim();
    } catch {
      base = null;
    }
  }
  const files = snapshot(repo, head);
  const baseFiles = base ? snapshot(repo, base) : staged ? new Map() : null;
  const changes = base ? changedPaths(repo, base, head) : [];
  return validateSnapshot(files, { baseFiles, changes });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = runValidation(process.cwd(), process.argv.slice(2));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error(`Architecture validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
