# Checkpoint deployment

The current source-backed deployment, release, rollback, and account-provisioning contracts are in [deployment and release operations](../AI/Architecture/infrastructure/deployment-and-release.md). That document distinguishes local configuration from unknown hosted state.

Use Node 24.15 or newer. Install with npm ci, run npm run dev for Angular plus the API, and use npm run check for typecheck, lint, formatting, API tests, and Angular build. Environment values belong only in ignored local files or the hosting provider.

Before committing, synchronize affected canonical architecture and preserve exact replaced blocks, then validate the index with npm run architecture:staged. Invoke independent branch-review before every push. Every main push requires an append-only release registration describing the exact pushed commit.

```powershell
npm run release:note -- "Integrate account login, game completion, and mobile queue" --kind feature
npm run release:note -- "Product launch" --kind release --version 1.0.0
npm run release:list
npm run release:rollback -- <registered-version> --git
```

Rollback commands preview their plan unless --yes is supplied. Only registered releases are targets. Every executed rollback creates a new registration; a Git rollback build reuses it. A Vercel rollback changes traffic separately from registration. Database migrations are never reverted automatically, and pre-migration application releases may be incompatible with the new schema.

Migration 015 intentionally clears only legacy release metadata before enforcing immutable registrations and build evidence. Latest is the latest registered record, not proof of successful deployment or currently served traffic. The release counter starts at 0.0.1 per environment; package.json 0.0.0 is a fallback.
