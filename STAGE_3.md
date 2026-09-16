# Stage 3 — Persistence (Single-User)

Roadmap item 3: _"Persistence (single-user) — auth, Postgres schema + RLS, save/load."_
Structure and style follow `CLAUDE.md`. Builds on Stage 1/2's canvas, store, and interaction hook — persistence wraps a save/load layer around them, it doesn't replace local editing.

### Goal

Give each user their own account and durable storage for diagrams, before any realtime or collaboration exists. This is also the first stage that ships: the app finally has something worth persisting across sessions, so the deploy workflow goes live here too (see `ROADMAP.md`'s CI/Deploy note).

### Scope

- Supabase project: Postgres schema for diagrams, RLS scoping every row to its owner
- Auth: email/password sign up, log in, log out via Supabase Auth
- Save: serialize the current canvas (shapes + viewport) to a named diagram row
- Load: list the signed-in user's diagrams, open one to restore its shapes/viewport into the local store
- shadcn/ui introduced — first real UI chrome (auth form, diagram list, save dialog) beyond the canvas itself
- `.env.example` + real `.env` for the Supabase URL/anon key (see `CLAUDE.md`'s Environment & secrets section)
- GitHub Pages deploy workflow — written and buildable, but not truly "live" until a real (non-local) Supabase project exists and its URL/anon key are added as `SUPABASE_URL`/`SUPABASE_ANON_KEY` repo secrets. Until then the workflow succeeds but ships a build with no working backend.

### Decisions made here (previously open questions)

- **Auth method: Supabase email/password.** Simplest option sufficient for single-user persistence; OAuth/magic-link can be added later without a schema change if ever needed.
- **No router yet.** Conditional rendering (signed out → auth form; signed in → diagram list + canvas) instead of adding react-router — not enough distinct pages yet to justify URLs. Revisit if that changes.
- **One JSONB blob per diagram, not per-shape rows.** `data: jsonb` holds the serialized `{ shapes, viewport }`. Simpler for single-user save/load; per-shape granularity only starts to matter once Stage 5's CRDT needs to merge concurrent edits at the shape level.
- **Developed and verified against a local Supabase stack** (`supabase start`, via Docker), not a hosted cloud project — auth, RLS, and save/load were all proven end-to-end locally. No real cloud Supabase project exists yet; that's a separate step needed before the deploy workflow actually works (see Scope above).

### Data model (Postgres)

```sql
create table diagrams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table diagrams enable row level security;

create policy "owner full access" on diagrams
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Hand-authored via `migration:` (`supabase migration new create_diagrams`), then `db:push` — per `CLAUDE.md`'s Supabase workflow.

### Structure (new packages/files, on top of Stage 1/2's tree)

```
cowire/
├── package.json                        # workspaces gains diagram-supabase-wrapper + supabase
├── supabase/                           # unprefixed CLI project (CLAUDE.md naming exception)
│   ├── config.toml
│   ├── migrations/
│   │   └── <timestamp>_create_diagrams.sql
│   └── database.types.ts               # generated via gen:types, never hand-edited
├── diagram-supabase-wrapper/            # typed abstraction over the Supabase client
│   └── src/
│       ├── auth.ts                     # signUp, signIn, signOut, getSession
│       ├── diagrams.ts                 # listDiagrams, saveDiagram, loadDiagram
│       └── index.ts
└── diagram-front-react/
    └── src/
        ├── supabase/                    # client context/provider/hooks
        │   ├── context.ts
        │   ├── provider.tsx
        │   └── hooks.ts
        ├── components/
        │   ├── ui/                      # shadcn-generated primitives (owned code)
        │   ├── AuthForm/index.tsx
        │   ├── DiagramList/index.tsx
        │   └── SaveDialog/index.tsx
        ├── hooks/
        │   ├── useAuth.ts               # session state + signIn/signUp/signOut
        │   └── useDiagrams.ts           # list/save/load, toast on success/failure
        └── lib/
            └── utils.ts                 # cn() helper (clsx + tailwind-merge) — first real use
```

### Tests

- `diagram-supabase-wrapper`: none planned yet — thin passthrough over the Supabase client, low logic density. Add tests if real logic (validation, serialization) accumulates.
- Any pure canvas-state ↔ JSONB serialization logic that isn't just a passthrough belongs in `lib/` and gets a `geometry.test.ts`-style unit test — decide once it's written, not upfront.

### Out of scope

- Realtime/multiplayer (Stage 4), CRDT (Stage 5)
- Multiple diagrams open at once, sharing a diagram with another user
- Touch/mobile input (Stage 7)
- **Replacing keyboard shortcuts with a toolbar.** shadcn/ui lands here for auth/diagram-list UI only — canvas tool switching (R/C/A/L/etc.) stays keyboard-driven until that's explicitly revisited, not just because a component library is now available.
