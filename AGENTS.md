# Project agent instructions

Read [AI/main-entry.md](AI/main-entry.md) again at every user message, before responding or taking action. It is the canonical project harness.

Before changing application files, discover the affected architecture and business contexts, follow relevant documentation to its leaves, and inspect implementation. Synchronize affected documentation in the same commit and preserve exact obsolete material in append-only deprecation archives. Validate staged content and invoke independent `branch-review` before every push. Every push to `main` must register a new release record; see the [release registration policy](AI/Architecture/infrastructure/deployment-and-release.md#release-registration-policy).

All AI-authored technical documentation, architectural descriptions, internal agent instructions, skill definitions, newly created identifiers, filenames, directory names, and code comments must use grammatically correct, technically precise English. Preserve existing compatibility-sensitive identifiers. Conversation follows the user's preferred language.
