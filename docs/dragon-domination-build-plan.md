# Castles & Dragons — Domination Strategy Game Build Plan (for Claude Code)

A browser-based, turn-based conquest game — a simplified, Game-of-Thrones-flavored strategy game on a **territory map** (the Wilson Lake Realms). **No research or tech tree.** The only victory is **domination**: raise armies, hatch and grow dragons, and capture enemy holds until you're the last power standing. Games run a hard **100 turns**.

**Two modes, built in this order:**
- **Stage A — Single-player vs AI.** Runs entirely in the browser. Ships **free and static on Cloudflare Pages** as a complete game.
- **Stage B — Co-op multiplayer** (up to 8 players; teams 4v4/3v3/2v2/FFA), via Cloudflare Workers + Durable Objects.

Drive Claude Code **one phase = one PR**. Finish Stage A (a shippable game) before Stage B.

---

## 1. The map model: a region graph

Ten named **holds**, each with a house sigil, divided by **Wilson Lake**. Modeled as a **graph** in `holds.json` (accompanies this plan):

- Each hold is a **node** (a region + castle) with an owner, `goldPerTurn`, terrain `defenseBonus`, a dragon egg, and any defenses built.
- Bordering holds are joined by an **edge**: **land** (all units), **bridge** (lake crossing, all units — chokepoint), **water** (open lake, **Dragons only**).
- **Three bridges** cross the lake: Florence–Sheffield, Florence–Muscle Shoals, Killen–Ford City. Land armies can only cross the lake at these. **Dragons ignore the lake entirely** (land + bridge + water).

**Strategic shape:** Wilson Lake splits the realm north/south; the three bridges are the pinch points, and dragons are the only force that can flank across open water. Great for North-vs-South team play.

The adjacencies were traced from the map art — **verify the bottom-edge borders (Littleville–Whiteoak) before Phase 1.**

---

## 2. Core design decisions

| Decision | Choice |
|---|---|
| **Victory** | **Domination.** Lose all holds → eliminated; last player/team standing wins. **Turn cap 100:** if undecided, winner = most holds, tiebreak = highest total army strength. |
| **Modes** | Single-player vs AI (local, free/static) **and** co-op multiplayer (teams). Single-player ships at end of Stage A. |
| **Map** | Region graph (`holds.json`): 10 holds, land/bridge/water edges, 3 bridges. |
| **Turn model** | **Team-sequential, immediate resolution.** A team acts together, each action resolves instantly; end turn → next team. Single-player = you're a team of one. A shared **turn counter runs 1→100.** |
| **Expansion** | **Capture only.** Neutral holds have small garrisons (and, after turn 5, a defending dragon). |
| **Economy** | **One resource: Gold.** Each held region yields Gold/turn; spend on units or defenses. |
| **Teams** | Allied teams: shared vision, can't attack each other, win/lose together. |

State is player/team-aware from Phase 1 even in single-player, so co-op isn't a retrofit.

---

## 3. Attack units (Gold-recruited, except dragons)

| Unit | Movement | Battle role | Source |
|---|---|---|---|
| **Swordsman** | 1 hold/turn; land + bridge | Melee backbone; strong defense | Recruit for Gold |
| **Archer** | 1 hold/turn; land + bridge | **First-strike volley** each round before melee; weak defense | Recruit for Gold |
| **Dragon** | up to 2 holds/turn; land + bridge **+ water** | Heavy attacker vs armies and castles; grows over the game | **Hatches from an egg — not recruited** |

## 4. Dragons & eggs — the decisive resource
Dragons are the defining force of the game and a **finite, contested resource: exactly 10 exist** (one egg per region), redistributed by conquest. All numbers live in `balance.ts` (§7a).
- **Every hold starts with one dragon egg.** All eggs **hatch on turn 5**; the dragon belongs to whoever holds that region then (neutral holds included). Eggs captured before turn 5 hatch for the new owner.
- Once hatched, a dragon is a **free-roaming unit** (moves up to 2 holds/turn, crosses land + bridge + water; fights independently).
- **Dragons die last.** In any battle, focus-fire removes Archers, then Swordsmen, then Dragons — so a dragon tanks and normally outlives the rest of its side.
- **The reliable dragon-killer is the Scorpion.** Scorpions target attacking dragons every round; short of a Scorpion (or a total wipe), a dragon usually survives a battle.
- **Claim on capture — this is the huge swing.** When a hold falls, any **surviving defending dragon is claimed by the attacker** (it changes sides) rather than dying. So taking a region often nets you its dragon: one extra dragon can flip the war. Conversely, losing a hold can hand your dragon to the enemy.
- **Neutral** holds' dragons defend in place; capture the hold and you claim its dragon.
- **Growth:** a dragon's strength and HP scale **linearly from turn 5 (weakest) to turn 100 (strongest)**, computed from the current turn (no per-turn bookkeeping). A maxed dragon is worth many armies; late game is a dragon war fought with Scorpions.

## 5. Defenses (Gold-built, one build action per hold per turn)
A hold's single build action each turn is **either** recruit a unit **or** construct one defense — a real offense/defense tradeoff. Defenses are persistent structures on the hold (modest stack caps, tunable):

| Defense | Counters | Effect in a siege of that hold |
|---|---|---|
| **Ramparts** | Swordsmen / melee | Raises the hold's effective `defenseBonus` for its garrison |
| **Watchtower** | Archers / armies | Fires a defensive **volley** at the attacking stack at battle start |
| **Scorpion** | **Dragons** | Anti-dragon ballista: heavy bonus damage to attacking dragons (modest vs others) |

## 6. Economy
- Each held region yields its `goldPerTurn` at the owner's turn start; spend Gold on the hold's one build action (unit or defense). No upkeep in v1. More holds → more Gold → bigger army and stronger defenses.

---

## 7. Repository structure (monorepo)

```
/
├── package.json                # workspaces: shared, client, server
├── packages/
│   ├── shared/                 # PURE, transport-agnostic — runs on client AND server
│   │   ├── src/
│   │   │   ├── balance.ts      # ⭐ ALL tunable numbers (costs, stats, dragon curve, defenses) — see §7a
│   │   │   ├── types.ts        # GameState(turn), Player, Team, Region, Edge, Unit, Dragon, Defense, Order
│   │   │   ├── graph.ts        # region graph: adjacency, edge-type passability per unit
│   │   │   ├── state.ts        # createInitialState(players, teams, mapData) — seeds eggs
│   │   │   ├── units.ts        # movement (land/bridge; dragons also water; dragon 2-move)
│   │   │   ├── dragons.ts      # egg hatch @turn 5, growth(turn) strength/HP curve
│   │   │   ├── holds.ts        # gold yield, build (recruit|defense), capture
│   │   │   ├── defense.ts      # ramparts/watchtower/scorpion effects
│   │   │   ├── combat.ts       # siege: watchtower volley -> archer volley -> melee; scorpion vs dragons
│   │   │   ├── turn.ts         # team-sequential turns; turn counter 1..100; end-of-game tiebreak
│   │   │   ├── ai.ts           # AI opponents / disconnected-player takeover
│   │   │   ├── victory.ts      # elimination / last team / turn-100 resolution
│   │   │   ├── rng.ts          # single seeded PRNG in state
│   │   │   └── protocol.ts     # client<->server messages (Stage B)
│   │   ├── data/{units.ts, defenses.ts, maps/holds.json}
│   │   └── tests/
│   ├── client/                 # Vite app → Cloudflare Pages
│   │   └── src/{main.ts, setup/, net/, render/, ui/}
│   └── server/                 # Cloudflare Worker + Durable Objects (Stage B)
│       └── src/{index.ts, GameRoom.ts, Lobby.ts}  + wrangler.toml
```

**Hard rules:** `packages/shared/**` imports nothing platform-specific (no DOM, no `window`, no Workers globals) — the same code runs single-player in the browser and the authoritative server in a Durable Object. The client sends **Orders** and renders results; it never owns authoritative state.

---

## 7a. Balance — one file to tune everything (`balance.ts`)
**All numbers live in `packages/shared/src/balance.ts` (accompanies this plan).** Nothing in the rules engine hardcodes a value — every cost, stat, the dragon growth curve, and every defense effect is read from `BALANCE`. To rebalance the game, edit that one file; nothing else changes. Keep it that way (reject PRs that hardcode numbers elsewhere).

**Combat model the numbers assume** (implement in `combat.ts` exactly so the values behave):
1. **Defensive fire (once, at siege start):** each **Watchtower** deals `watchtower.volley` to the attackers; each **Scorpion** deals `scorpion.vsDragonPerRound` to the strongest attacking dragon (this also repeats every melee round below).
2. **Archer volley (once, first strike):** each attacking Archer deals `archer.volley` to defenders; each defending Archer deals `archer.volley` to attackers.
3. **Melee rounds (repeat until one side has no units, or the attacker is wiped):** each round, Scorpions fire again at dragons; then both sides deal `sum(unit.atk)` to the other. **Damage to defenders is reduced** by their defense: `reduction = min(defense.maxReduction, (terrainDefenseBonus + ramparts×ramparts.defensePoints) × defense.reductionPerPoint)`.
4. **Casualties & focus order:** damage focus-fires the enemy stack in the order **Archer → Swordsman → Dragon** (dragons die last). A seeded RNG applies the small `combat.variance` swing.
5. **Capture:** when the defending **units** are wiped, the hold flips to the attacker; a **surviving defending dragon is claimed** by the attacker (not destroyed); built defenses are destroyed on capture.

**Starting numbers (educated first pass — dragon-dominant, all in `balance.ts`):**
- **Economy:** `goldPerTurn` per hold 2–3 (from `holds.json`); 1 build action per hold per turn.
- **Costs (gold):** Swordsman 3, Archer 4, Ramparts 5, Watchtower 5, Scorpion 6.
- **Swordsman:** atk 10, hp 30. **Archer:** atk 6 melee, hp 15, volley 12.
- **Dragon (scales turn 5→100):** atk 15→80, hp 60→400, move 2. So a fresh dragon ≈ two swordsmen; a turn-50 dragon ≈ six; a maxed dragon shrugs off small armies.
- **Defenses:** Ramparts +2 defense points each (cap 2); Watchtower volley 15 (cap 2); Scorpion 40 dmg/round to dragons, 5 to others (cap 3). `defense.reductionPerPoint` 0.06, `maxReduction` 0.60.
- **Dragon-killing benchmark these produce:** ~6 swordsmen trade evenly with a turn-50 dragon; killing a dragon outright before it captures the hold effectively requires **Scorpions** (about 2–3 to stop a maxed dragon alongside a garrison). This is the intended arms race.

---

## 8. Map data schema (`holds.json`)
- `regions[]`: `{ id, name, sigil, terrain, defenseBonus, goldPerTurn, side, labelPos{x,y}, owner, dragonEgg }`. `owner` is `slot:N` or `neutral`; `labelPos` is normalized (0–1) for placing the hold's banner on the map image.
- `edges[]`: `{ a, b, type }` with `type` ∈ `land | bridge | water`. Land/bridge = all units; water = dragons only.
- Top-level `turnLimit` (100) and `dragonRules` (egg per region, hatch turn 5, growth, movement).
Loader validates ids, edge references, terrain, and enough non-neutral start slots for the player count. **Verify adjacencies vs the art first.**

---

## STAGE A — Single-player vs AI (ships free & static on Cloudflare Pages)

### Phase 0 — Scaffold + Pages deploy
Monorepo; Vite + TS + Vitest; `.nvmrc` (node 20). Client renders the map image full-viewport; one trivial passing test. Connect **Cloudflare Pages** (build `npm run build -w client`, output `packages/client/dist`, `NODE_VERSION=20`); confirm the `.pages.dev` URL loads.
**Acceptance:** dev/build/test green; live URL shows the map.

### Phase 1 — Region graph, map data, rendering
- `Region`, `Edge`, `Player`, `Team`, `GameState` (N players + teams; `turn` field). `graph.ts`: load `holds.json`; `neighbors(id)`; `passableBy(edge, unitType)` (dragons cross water, land units don't); seed RNG; seed one egg per region.
- **Rendering v1:** map PNG as board; interactive **banner/marker** at each `labelPos` showing owner color + garrison; **adjacency lines** (land/bridge solid, water dashed).
- **Rendering v2 (later):** trace holds as SVG **polygon hotspots** over the art; tint owned holds. Render-layer only, no logic impact.
- **Tests:** neighbor/passability; loader rejects malformed maps; egg seeded per region; state builds for 2–8 players.
- **Acceptance:** all ten holds render with owners colored, edges shown, eggs present.

### Phase 2 — Units, movement, turn counter
- `Unit` (id, owner, type, hp, coord=regionId); Swordsman/Archer data. Select units in a hold; move to an **adjacent** hold along a passable edge. Friendly hold = reinforce; enemy/neutral = battle (stub until Phase 4).
- `turn.ts`: **team-sequential** with immediate resolution; a **turn counter advancing 1→100**; movement refreshes at a team's turn start.
- HUD: active team, turn number, selected stack, End Turn.
- **Tests:** movement respects adjacency + edge passability; land units can't cross water; turn counter advances; team → team passing.
- **Acceptance:** move units between holds; cycle turns between two teams; counter climbs.

### Phase 3 — Holds: Gold, recruiting & defenses
- Held regions yield `goldPerTurn` at turn start. Hold panel: treasury + **one build action/turn** — recruit **Swordsman/Archer**, or construct **Ramparts/Watchtower/Scorpion** (with stack caps). `defense.ts` stores per-hold defenses.
- **Tests:** gold accrual; build gating by Gold; one-build-per-hold-per-turn; defense caps; recruit vs fortify are mutually exclusive per hold per turn.
- **Acceptance:** earn Gold; recruit units and build each of the three defenses at your holds.

### Phase 4 — Siege battle & capture
- `combat.ts` implements the exact model in §7a, reading every number from `balance.ts`: **Watchtower volley** + **Scorpion** fire → **Archer first-strike volley** → **melee rounds** with defense reduction (terrain `defenseBonus` + **Ramparts**) and Scorpions re-firing at dragons each round; **focus-fire order Archer → Swordsman → Dragon (dragons die last)**; seeded variance.
- **Capture:** wiping the defending **units** flips the hold (Gold to captor next turn); a **surviving defending dragon is claimed by the attacker**; built defenses are destroyed on capture. Neutral holds have a small garrison.
- **Team rule:** allies untargetable; cross-team only. UI: battle log (volleys, rounds, casualties, dragon claimed, outcome).
- **Tests:** resolution order; dragons die last; ramparts/watchtower/scorpion effects; scorpion bonus vs dragons only; **surviving dragon is claimed on capture**; deterministic under a seed.
- **Acceptance:** archers + swordsmen storm a fortified hold; a Scorpion kills an attacking dragon; capturing a defended hold claims its dragon.

### Phase 5 — Dragons: hatch & growth
- `dragons.ts`: at **turn 5**, every egg hatches into a Dragon owned by the region's current holder (neutral dragons defend in place). Exactly **10 dragons exist**, redistributed by conquest (claim-on-capture from Phase 4). Dragon `atk(turn)`/`hp(turn)` interpolate from `balance.ts` (`atkAtHatch→atkAtMax`, `hpAtHatch→hpAtMax`) linearly turn 5→100.
- Dragon movement: up to **2 holds/turn**, crossing land + bridge + **water** (flank across the lake). Dragons fight in sieges and die last; Scorpions are their counter.
- **Tests:** eggs hatch exactly at turn 5 to the correct owner; growth curve monotonic to turn 100; dragons cross water; captured-before-hatch egg transfers.
- **Acceptance:** dragons hatch on turn 5, strengthen over time, fly the lake, and can be answered by Scorpions.

### Phase 6 — AI opponents
- `ai.ts`: each AI team collects Gold, builds a unit/defense mix, moves toward weak enemy/neutral holds (using the graph incl. dragon water routes), defends bridges and dragon-hatch regions, and attacks/captures — emitting the same Orders humans use. Difficulty = aggression/economy knob.
- Wire the loop: human team → AI team(s) → repeat, acting visibly, advancing the turn counter.
- **Tests:** AI emits only legal Orders; AI captures an undefended neutral hold; AI builds Scorpions when facing dragons; AI defends Florence's bridges.
- **Acceptance:** a real single-player game vs 1+ AI you can win or lose.

### Phase 7 — Victory, elimination & turn-100 end
- `victory.ts`: zero holds → eliminated; last team standing wins (checked each turn end). **At turn 100**, if undecided: winner = most holds, tiebreak = highest total army strength (incl. dragons), else draw. UI: win/lose/draw screen + restart.
- **Tests:** elimination on last hold; last-team fires once; turn-100 resolution + tiebreak correct.
- **Acceptance:** win by conquest, lose by losing all holds, or reach turn 100 and resolve.

### Phase 8 — Setup, save, polish → **ship single-player**
- **Setup screen:** Single Player; assign starting holds (your hold/side, AI count 1–7, presets: **North vs South**, 4v4, 3v3, FFA; difficulty). Unassigned holds start neutral. **Multiplayer** button present but disabled until Stage B.
- Save `GameState` to `localStorage`; resume on load; New Game clears. (Same serialization powers Stage B snapshots.)
- Stretch: fog of war; polygon-hotspot rendering (v2); keyboard shortcuts.
- **Tests:** serialize → deserialize round-trips exactly (incl. dragons/defenses/turn); each preset yields a valid initial state.
- **Acceptance:** configure and play a full single-player game on the live Pages URL. **Shippable game.**

**Gate before Stage B:** single-player complete, all core tests green, battle + dragon growth deterministic.

---

## STAGE B — Co-op multiplayer (Cloudflare Workers + Durable Objects)

One **Durable Object per game room** holds authoritative state (single-threaded actor → no in-room races); the `shared` core runs unchanged inside it.

### Phase 9 — Backend skeleton
`server/`: router Worker + `GameRoom` DO; `wrangler.toml` with DO binding + migration; **WebSocket Hibernation API** (turn-based = sparse messages = near-zero idle cost). Client `net/` connects + echoes. `wrangler dev`; `wrangler deploy` to `*.workers.dev`.
**Acceptance:** deployed client round-trips a ping with the DO.

### Phase 10 — Authoritative state in the DO
Move the `shared` reducer into `GameRoom`: client sends **Orders**, DO validates, applies with immediate resolution, broadcasts. On join, DO sends a full snapshot. Server rejects illegal/out-of-turn orders; never trust the client.
**Acceptance:** two browsers share one authoritative game.

### Phase 11 — Lobby, teams, mode routing
Router: `POST /rooms` → code → DO; join by code. `Lobby` in DO: players, names, **team/hold assignment** (North vs South, 4v4, 3v3, 2v2, FFA), ready, host, `started`; empty holds → AI. Setup routes Single Player → local, Multiplayer → room.
**Acceptance:** friends join by code, pick teams/holds, host starts.

### Phase 12 — Networked team-sequential turns
DO tracks the **active team**; only its players act; actions apply live and broadcast; end-turn passes to the next team (AI resolved server-side); the DO owns the 1→100 counter.
**Acceptance:** an up-to-8-player team game plays through turns correctly.

### Phase 13 — Reconnection, persistence, disconnects
Client-stored **player token** re-associates a reconnecting socket; DO replies with a snapshot. DO persists `GameState` so long games survive everyone leaving. Disconnect: brief pause, then `ai.ts` covers or host skips.
**Acceptance:** drop and rejoin mid-game; resume after all leave.

### Phase 14 — Production deploy
Client on **Cloudflare Pages**; server via `wrangler deploy` (**Workers Paid $5/mo** only beyond the free tier; no egress fees). Client reads `VITE_SERVER_URL`; configure allowed WebSocket origins.
**Acceptance:** 8 friends play a full team game from the production URL.

---

## 9. Cost summary
- **Single-player (Stage A):** free — static site on Cloudflare Pages, no backend.
- **Co-op (Stage B):** free tier covers a private friends game (Durable Objects free allowance + Hibernation API); budget **$0–5/month** (Workers Paid minimum) beyond it. No egress/bandwidth charges.

## 10. How to drive Claude Code
- Give it this document **plus `holds.json`** and the **map PNG**, then: **"Execute Phase 0 only. Open a PR. Stop."** Review, merge, confirm deploy, proceed. One PR per phase.
- **Ship Stage A first** — it's a complete game. Only then start Stage B.
- Enforce in review: `packages/shared/**` stays platform-agnostic; client never holds authoritative state; server trusts no client input.
- Require tests + green build on every PR; split any phase that balloons.

## 11. Confirm before Phase 1
- **Adjacency graph:** verify `holds.json` edges vs the art — especially the **Littleville–Whiteoak** bottom border and that the three bridges are right.
- **Tuning starters:** all set with sensible defaults in **`balance.ts`** — no decisions needed to start. Tune there after playtesting (dragon curve, defense sizes, costs).
- **Build rule:** confirm **one build per hold per turn (unit OR defense)** vs allowing both.
- **Starting holds / team presets:** North-vs-South split; holds per player (default 1, rest neutral).
- **Map art file:** place the PNG where the loader expects `image` (e.g. `packages/client/src/render/assets/map.png`).
