# Checkpoint - game collection

Checkpoint is a web application with a Node API and a React frontend.
It includes 481 games imported from a spreadsheet.
The interface provides three screens: game list, recommended queue, and details.
The visual design uses components inspired by shadcn, colored badges, and a responsive layout.

## Run the application

Prerequisite: install Node.js 24.15 or newer.

1. Install dependencies: `pnpm install`.
2. Build the packages and web app: `pnpm build`.
3. Start the API server: `pnpm start`.
4. Open `http://localhost:3000` in your browser.

Keep the terminal open while you use the application.

## Development

1. Install dependencies: `pnpm install`.
2. Start development servers: `pnpm dev`.

The frontend runs at `http://localhost:5173`.
The API runs at `http://localhost:3000`.
`pnpm dev` reloads the API on file changes and runs Vite with HMR for the frontend.

Run quality gates with `pnpm check`.
Format code with `pnpm format`.
Lint code with `pnpm lint`.

## Authentication (Supabase Auth)

The API reads `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from `.env`.
The frontend requests public configuration from `GET /api/v1/config` on startup.
It creates a Supabase client that manages session tokens.

All `/api/*` routes require `Authorization: Bearer <access_token>`, except `health`, `openapi.json`, and `config`.
The API validates JWT signatures locally using project JWKS keys (`apps/api/src/auth/auth.ts`).
Without `SUPABASE_URL`, the API runs without authentication in development only.
In production, missing authentication causes the API to return HTTP 503.
Set `AUTH_GITHUB_ENABLED=true` to enable GitHub authentication.
The request context provides current user data through `getContext()` in `apps/api/src/shared/context.ts`.

## Data and persistence

The seed dataset in `apps/api/src/data/seed.ts` contains initial game records.
Records include Steam App IDs, hours played, ratings, comments, and formula scores.
The algorithm calculates current values dynamically; previous imported scores remain in `imported`.
Empty cells become `null` or empty strings.
A rating of zero indicates an unrated game.
All dates use ISO 8601 formatting.

In local file mode, the API persists records to JSON files in `DATA_DIR`.
In database mode, the API persists records to PostgreSQL through Supabase.
Set `DATA_DIR`, `PORT`, and `HOST` through environment variables.
The server listens on `127.0.0.1` by default.

Game covers load from the Steam CDN when a Steam App ID exists.
Games without an App ID display a generated placeholder cover.
The application operates without internet connectivity, but remote images require network access.

## API and routes

The OpenAPI contract lives in `apps/api/openapi.json` and serves at `/api/v1/openapi.json`.
Shared models live in `packages/core/src/models.ts`.

Key routes:

- `GET /api/v1/games`: Search, filter, sort, and paginate games.
- `GET /api/v1/games/{id}`: Retrieve game metadata and scores.
- `PATCH /api/v1/games/{id}`: Update game properties with validation.
- `GET /api/v1/catalog`: Retrieve filter options and counts.
- `GET /api/v1/recommendations`: Retrieve the recommended queue with explanations.
- `POST /api/v1/queue/reorder`: Validate and pin a game to a fixed position.
- `GET /api/v1/queue/adjustments`: List pinned positions and movement history.
- `DELETE /api/v1/queue/adjustments/{gameId}`: Unpin a game.

### Fixed queue positions

Users can drag game items on the queue screen to pin positions.
Supported controls include mouse, touch long-press, and keyboard shortcuts (Space to grab, arrows to move, Space to drop, Esc to cancel).

The frontend updates the interface immediately and sends move requests sequentially.
The API validates the request, returns HTTP 200, and recalculates positions in the background.
Background persistence uses exponential backoff retry logic in `apps/api/src/shared/retry.ts`.

The server calculates the displayed queue in memory on read requests.
It combines the score-ranked list with manually pinned positions.
Completed games lose their pinned position automatically.
Games with immediate interest rank at the top of the score queue.

`GameService` consumes `GameRepository` defined in `apps/api/src/data/ports.ts`.
`apps/api/src/main/setup.ts` injects the configured repository driver.

## Scoring and ordering

The base score formula combines three factors: interest (50%), affinity (35%), and duration (15%).

- **Interest**: Very High (100), High (75), Medium (50), Low (25), Very Low (0).
- **Affinity**: Converts ratings (1 to 5) into scores (0 to 100) by primary genre, mechanics, and pace.
- **Duration**: Prefers main story plus extra content, then main story, then previous estimates.
- A personal duration multiplier adjusts estimates based on historical play times (bounded between 0.5 and 2.0).

The queue builds position by position and applies contextual penalties and bonuses.
Scoring weights live in `apps/api/src/domain/scoring.ts`.

- **Penalties**: Same genre (-18), recent genre (-8), same mechanic (-10), consecutive long games (-24).
- **Bonuses**: Calm to intense pace contrast (+8), short game after a long game (+6), in-progress game (+8).

Prerequisites appear before sequels in the recommendation queue.
Finished, abandoned, and endless titles stay out of the recommended queue.
Scores represent recommendation priority, not quality ratings.

The API recalculates recommendations on every read request from saved data.
It requires no background cron job or manual database sync.
