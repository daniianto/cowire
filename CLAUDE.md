# Conventions

Cross-stage rules that apply regardless of which `STAGE_N.md` is active. Stage docs assume these; they shouldn't repeat them.

## Monorepo layout
- npm workspaces, one package per concern, prefixed with the project name (e.g. `<project>-front-react`, `<project>-supabase-wrapper`, `<project>-crdt-core`)
- Root `package.json` scripts delegate into workspaces: `build:<pkg>`, `dev:<pkg>`, plus `db:pull` / `db:push` / `gen:types` / `migration` for the Supabase package once persistence lands

## Structure (type-oriented)
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
- `lib/utils.ts` exports a `cn()` helper (clsx + tailwind-merge) for conditional/merged class names
- Tailwind for styling

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

## Testing
- Vitest, not colocated — tests live in a top-level `test/` directory per package (e.g. `<package>/test/geometry.test.ts`)
- `describe` / `it` / `expect` from `vitest`; a `vitest.config.ts` per package with `include: ["test/**/*.test.ts"]`

## Git
- Husky `pre-commit`: `lint` → `format` → relevant `test` script → `git add -u`
- Commit per logical stage milestone, not per file
- Commit message: `<type>: <description>` — description is terse (abbreviate words and symbols where unambiguous), lowercase, no trailing period
- No commit body/description — subject line only

## README (relevant once we reach Stage 8)
Format: a Table of Contents, a "Known Issues" section, and a "Design Decisions & Trade-offs" section.

---
*As of 2026-09-15.*
