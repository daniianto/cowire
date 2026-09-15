# Conventions

Cross-stage rules that apply regardless of which `STAGE_N.md` is active. Stage docs assume these; they shouldn't repeat them.

## Monorepo layout

- npm workspaces, one package per concern, prefixed with the project name (e.g. `<project>-front-react`, `<project>-supabase-wrapper`, `<project>-crdt-core`) — exception: the raw Supabase CLI project is just `supabase`, unprefixed (see Supabase section)
- Root `package.json` scripts delegate into workspaces: `build:<pkg>`, `dev:<pkg>`

## Structure (type-oriented)

Barrel/zustand chosen deliberately: a canvas app needs shared global state across many components, so a flat-file/no-global-store alternative wasn't a fit.

Within a frontend package, organize by role, not by feature:

```
src/
├── components/   # PascalCase folder per component, index.tsx inside; components/index.ts barrels them
├── hooks/        # camelCase, use-prefixed, one hook per file
├── state/        # zustand stores, one per domain, exports useXStore
├── views/        # top-level routed screens; views/index.ts barrel
├── lib/          # small shared utils (e.g. lib/utils.ts, cn())
└── supabase/     # client context/provider/hooks
```

- Barrel `index.ts` files ARE used per type-folder (re-export with `export * from "./X"`) — this is the one place barrels are the convention, not the exception
- Component folder = `ComponentName/index.tsx`, not `component-name.tsx`

## UI

- shadcn/ui for component primitives — generated components live in `components/ui/` and are treated as owned code (editable), not a vendored dependency
- Tailwind v4, CSS-first: no `tailwind.config.js` — `@import "tailwindcss"` + `@theme inline` design tokens live in the root stylesheet; dark mode via a `.dark` class toggle + `@custom-variant dark (&:is(.dark *))`
- `lib/utils.ts` exports a `cn()` helper (clsx + tailwind-merge) for conditional/merged class names
- `class-variance-authority` (cva) for component style variants, used alongside `cn()`
- `lucide-react` for icons
- `sonner` for toast notifications — but toasts are only for async/background events (a save completed, a realtime disconnect/reconnect). Errors/warnings tied directly to a user action (form validation, a rejected input) render as inline blocks (e.g. shadcn `alert`), never as a toast
- UI must be responsive/adaptive across viewport sizes — verify new screens/components at common breakpoints (mobile/tablet/desktop), not just at desktop width

## Code style

- Prettier: double quotes, semicolons, 2-space indent, printWidth 80, trailingComma "es5", arrowParens "always", LF
- ESLint flat config (`eslint.config.mjs`): `@eslint/js` recommended + `typescript-eslint` recommended + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh`
- Named exports only, arrow function components — no `export default`
- `type Props = {...}` for component props and shape definitions — prefer `type` over `interface` throughout
- TS strict mode on: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `verbatimModuleSyntax`; `moduleResolution: bundler`; path alias `@/*` → `src/*`

## Comments — override the general "no comments" default

This codebase's actual style is comment-friendly, not comment-averse:

- Short, lowercase, present-tense inline comments above non-trivial steps inside a function (e.g. `// transform screen coords into canvas space before hit-testing`)
- JSDoc-style block comments (`/** ... */`) above exported functions/hooks that do non-obvious work, describing what it does and (when relevant) params
- Keep following this style even though it's more verbose than the general default

## Supabase (relevant once persistence lands, Stage 3+)

- `supabase` is its own unprefixed workspace package: `config.toml`, `migrations/`, and generated `database.types.ts` live there — separate from `<project>-supabase-wrapper`, the hand-written TS abstraction layer over the client
- Migrations are hand-authored first, not pulled: run `migration:` (`supabase migration new <name>`, named for what it does) to create the file, write the SQL, then `db:push` to apply it. This keeps schema changes reviewable in a PR and reproducible across environments — important since this project is co-op/multi-collaborator
- `db:pull` is a fallback for reconciliation only (e.g. someone made an out-of-band change in the Studio dashboard) — not the everyday workflow; a pulled migration should be renamed from the auto-generated `..._remote_schema.sql` to describe what it does
- `database.types.ts` is always generated via `gen:types`, never hand-edited — regenerate after every schema change and commit the result so the wrapper package gets compile-time schema safety
- Root scripts (all `cd supabase && supabase ...`): `db:pull`, `db:push`, `migration`, `gen:types`

## Environment & secrets (relevant once Supabase lands, Stage 3+)

- Config values (Supabase URL/anon key, etc.) come from `.env` files, never hardcoded
- Each package that needs env vars ships a committed `.env.example` with placeholder values; the real `.env` is gitignored
- Vite env vars are prefixed `VITE_` to be exposed to client code

## Performance

This app leans on co-op (multi-user, concurrent) editing, so rendering and merge logic need to stay fast as shape count and collaborator count grow — see `ROADMAP.md` for why stages are ordered the way they are.

- Avoid unnecessary re-renders: keep zustand selectors narrow (subscribe to the slice you need, not the whole store), memoize expensive derived values
- Hit-testing, bounding-box math, and any per-frame canvas work should stay correct-but-cheap at small shape counts now; revisit algorithmic complexity (spatial indexing, dirty-region redraw) before it becomes the bottleneck, not preemptively
- Collaborative updates (Broadcast in Stage 4, Yjs in Stage 5+) should batch/debounce rather than send one message per pointer-move or keystroke
- Profile before optimizing — don't hand-tune based on guesses; when a stage doc calls out a specific perf target or measurement, treat it as a checkpoint to hit before moving to the next stage
- Known risk: Stage 2's undo/redo is built local-only, before any collaborative editing exists. Undo under concurrent multi-user edits is a known hard problem (this is why Yjs ships its own `UndoManager`) — expect Stage 2's implementation to need rework, not just wiring-up, once Stage 5's CRDT lands

## Testing

- Vitest, not colocated — tests live in a top-level `test/` directory per package (e.g. `<package>/test/geometry.test.ts`)
- `describe` / `it` / `expect` from `vitest`; a `vitest.config.ts` per package with `include: ["test/**/*.test.ts"]`
- Stages 4-6 (realtime, CRDT, persistence-sync) need integration tests that simulate concurrent clients (e.g. two Yjs docs merging, two Broadcast clients racing to edit the same shape) — unit tests alone won't catch merge/ordering bugs

## Git

- Husky `pre-commit`: `lint` → `format` → relevant `test` script → `git add -u`
- Commit per logical stage milestone, not per file
- Commit message: `<type>: <description>` — description is terse (abbreviate words and symbols where unambiguous), lowercase, no trailing period
- No commit body/description — subject line only

## README (relevant once we reach Stage 8)

Format: a Table of Contents, a "Known Issues" section, and a "Design Decisions & Trade-offs" section.

---

_As of 2026-09-15._
