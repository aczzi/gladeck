# Copilot AI Agent Instructions

Vue 3 + TypeScript deckbuilding/village-management game, with persistent state in Firebase Firestore. Project structure is based on `/Users/antoine.cozzi/perso/colorcollection` (Vuex accumulator store, single-session enforcement, one Firestore document per user). Game design source of truth is `ROADMAP.md` at the repo root.
Every text in the codebase must be only in English without any emojis.

## Architecture & Key Patterns

- **Component-Driven**: All game logic is in Vue SFCs under `src/components/`, with submodules for core systems (`buildings/`, `deck/`, `modals/`, `subComponents/`).
- **No Vuex for Core Logic**: State is managed via the gameStore composable and pure functions in `gameRules.ts`, not ad-hoc component state, for main game flows.
- **Central Types**: All interfaces/types are in `src/core/game/types.ts` (e.g., `UserData`, `Card`, `Buildings`, `Profile`). Always import from here for consistency.
- **Game Formulas**: Every formula from ROADMAP.md (deck line modifiers, AI budget, luck roll, damage floor, building yields, attrition) lives in `src/core/game/gameRules.ts` as a pure function, commented with the ROADMAP section it implements. Keep the two in sync.
- **Firebase Integration**: All Firestore access is via `src/core/firebase/`. Use `isDevelopment` and `useEmulator` from `core/utils.ts` to select environment. Never hardcode Firestore endpoints outside `firebaseConfig`.
- **Store Architecture**: All components communicate with Firestore exclusively through the gameStore (`src/core/store/index.ts`). The store uses an accumulator pattern that batches updates every 25 seconds to minimize Firestore writes. NEVER write directly to Firestore from components or services - always use `updateUserData()` from the gameStore.
- **Session Management**: The game enforces a single-session policy to prevent cheating (multi-session could allow rollback of strategic combat/deck choices). The `sessionManager` (`src/core/firebase/sessionManager.ts`) automatically kicks out any previous session when a user connects from a new device/window. Multi-session is strictly forbidden.
- **Data model deviation from ROADMAP.md §7**: buildings and cards are stored as map fields on the single `users/{userId}` document (not Firestore subcollections), so every write flows through the same 25s accumulator. See README.md "Notes on the data model".
- **Game Systems**: Village (5 buildings: Mine, Barracks, Forge, Infirmary, Market) and Arena (deck draw, Frontline/Backline placement, auto-resolution) are separate top-level screens (`Village.vue`, `Arena.vue`), toggled from `MainView.vue`.

## Developer Workflows

- **Start Dev**: `npm run emulator` (Firestore emulator), then `npm run dev` (Vite server)
- **Local Test Data**: `node scripts/bootstrap.js <username> <level>` seeds a dev user and `admin/configuration` in the emulator.
- **Testing/Debug**: Firestore emulator UI at `localhost:4000`. Use Vue devtools for state inspection.
- **Environment**: Controlled by `VITE_USE_EMULATOR` env var. See `src/core/firebase/index.ts` for config pattern.

## Integration Points

- **Firestore Collections**: All user data is under `users/{userId}` (see README and `types.ts`). Game-wide on/off switch is `admin/configuration`.
- **Scripts**: Dev/admin scripts are in `scripts/` and use Node.js.

## Key Files/Directories

- `ROADMAP.md` - game design and formulas (source of truth)
- `src/components/` - All UI/game logic
- `src/core/game/types.ts` - All types/interfaces
- `src/core/game/gameRules.ts` - All formulas (slots, combat, buildings)
- `src/core/firebase/` - Firestore integration
- `src/core/store/` - Vuex accumulator store + `useGameStore()` composable
- `scripts/` - Dev/admin scripts

## Dependencies

- Vue 3.5, TypeScript, Firebase 12.x, Bootstrap 5.3, Vite

---

**For AI agents:**

- Always follow the accumulator update pattern (`updateUserData()`) to avoid data loss.
- Never bypass the environment check for Firestore.
- Use only the types/interfaces from `types.ts`, and formulas from `gameRules.ts`.
- Prefer Bootstrap classes for UI.
- Reference this file, `ROADMAP.md`, and `README.md` for system/gameplay details.
- CRITICAL: All Firestore writes must go through the gameStore's `updateUserData()` function. Never use `updateDoc()`, `setDoc()`, or any direct Firestore write operations outside of `src/core/store/index.ts`.
- CRITICAL: Multi-session is forbidden for anti-cheat purposes. The sessionManager enforces single-session only. Never implement features that allow multiple simultaneous sessions.
- Open design decisions are tracked in ROADMAP.md §9 - check there before inventing new balancing rules.
