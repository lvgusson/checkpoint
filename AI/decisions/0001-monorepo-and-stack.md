---
name: 0001-monorepo-and-stack
description: Why the repo is a pnpm monorepo with this stack.
type: decision
area: root
status: accepted
date: 2026-10-14
---

# 0001 Monorepo and stack

## Context

The product moved from a single-package Angular app to a reusable base. The next products should reuse authentication, authorization, HTTP, validation, remote state, observability and UI behaviors.

## Decision

- pnpm workspaces: `apps/api`, `apps/web`, `packages/core`, `packages/ui-react`.
- React, Vite, Ky, TanStack Query, Zod, Tailwind and shadcn/ui for the web app.
- Keep the Node API, services, repositories, PostgreSQL and Supabase Auth.
- Errors follow RFC 9457; roles come from `app_metadata.role`; logs go through a pluggable sink.
- Extract a package only when a second real consumer exists.

## Consequences

Contracts and the UI kit are shared by path, not published. Hosting stays on Vercel and Supabase until measurements justify a change.

## Related

- [[AI/index]]: Entry point: pick the area you change and follow one link.
- [[AI/core/core]]: Contracts in packages/core and the packages/ui-react kit, with their dependency rules.
