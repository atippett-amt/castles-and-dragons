# Castles & Dragons

A browser-based, turn-based conquest game on the **Wilson Lake Realms** — ten
holds split north/south by a lake, three bridges, and exactly ten dragons.
The only victory is domination. Games run a hard 100 turns.

**Live:** https://castles-and-dragons.austin-tippett.workers.dev/

- **Stage A** — single-player vs AI, shipping free and static on Cloudflare Workers.
- **Stage B** — co-op multiplayer (up to 8, teams) on Workers + Durable Objects.

See [`dragon-domination-build-plan.md`](docs/dragon-domination-build-plan.md) for
the full design and phase breakdown.

## Requirements

Node 20 (see `.nvmrc`). Node 22 also works.

**Vite is pinned to 7.x at the repo root, deliberately.** Vitest accepts
`vite@^6 || ^7 || ^8`, and left alone npm hoists Vite 8, which pulls in Rolldown
and its `@napi-rs/wasm-runtime` package. That package declares `@emnapi/core` and
`@emnapi/runtime` as *peer* dependencies, and npm installing on Windows never
writes them to the lockfile — so `npm ci` on Cloudflare's Linux builder fails with
`EUSAGE ... Missing: @emnapi/core from lock file`. Pinning 7 at the root makes the
client and Vitest dedupe onto one Rollup-based Vite and removes the whole chain.
If you bump Vite, run `npm ci` on a clean checkout before pushing.

## Commands

```sh
npm install         # once, from the repo root
npm run dev         # Vite dev server for the client
npm run build       # production build -> packages/client/dist
npm test            # Vitest, all packages
npm run typecheck   # tsc --noEmit across shared + client
```

## Layout

```
packages/
├── shared/   # PURE rules engine — no DOM, no window, no Workers globals.
│             # The same code runs in the browser and in a Durable Object.
├── client/   # Vite app. Sends Orders, renders results. Never authoritative.
└── server/   # Empty until Stage B.
```

Two rules that must hold for the whole project:

1. **`packages/shared/**` imports nothing platform-specific.** That is what lets
   single-player and the authoritative server run identical code.
2. **All tunable numbers live in `packages/shared/src/balance.ts`.** No cost,
   stat, dragon curve value, or defense effect is hardcoded anywhere else.

## Deploying

Deployed as a **Cloudflare Worker serving static assets**, not a Pages project.
Cloudflare's own guidance is to start new projects on Workers — Pages still works
but no longer receives feature investment — and Stage B needs a Worker with
Durable Objects regardless. Shipping Stage A this way means Stage B extends the
same Worker instead of adding a second service.

Configuration lives in [`wrangler.jsonc`](wrangler.jsonc). Dashboard settings:

| Field | Value |
|---|---|
| Build command | `npm run build -w client` |
| Deploy command | `npx wrangler deploy` |
| Root directory | *(leave as the repo root — npm workspaces install from here)* |

Node version comes from `.nvmrc`; no `NODE_VERSION` variable is needed.

`wrangler` is intentionally **not** a devDependency. It pulls `workerd` and
`esbuild`, both of which ship platform-specific binaries — precisely the kind of
dependency that produced the Windows-vs-Linux lockfile break described above.
Letting the deploy command fetch it via `npx` keeps those binaries out of
`package-lock.json`.

## Phase status

- [x] **Phase 0** — scaffold, deploy config, map renders full-viewport, tests green, live URL verified
- [x] **Phase 1** — region graph, map loader/validation, seeded RNG, initial state, board rendering
- [x] **Phase 2** — units, stacks, movement along passable edges, team-sequential turns
- [x] **Phase 3** — gold income, recruiting, and the three defenses
- [x] **Phase 4** — siege battle, capture, claim-on-capture, neutral garrisons
- [x] **Phase 5** — dragons hatch on turn 5 and grow to turn 100
- [ ] Phase 6 — AI opponents
- [ ] Phases 7–8 — victory, setup/save
