# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — start the Vite dev server (opens on port 3000)
- `npm run build` — production build (outputs to `build/`, not `dist/`)
- `npx tsc --noEmit` — type-check the project (not wired into a script; Vite's `@vitejs/plugin-react-swc` transpiles without type-checking, so this is the only way to catch type errors)

There is no lint or test script configured in this project.

This project is pinned to Node 18 via `.nvmrc` (the currently installed npm requires Node ≥18.17 to run at all). If using nvm, `nvm use` picks it up automatically.

## Architecture

This is a small single-page game, not a multi-route app. Everything runs through one component tree:

- `index.html` → `src/main.tsx` → `src/App.tsx`
- `src/App.tsx` contains the login flow and all game logic/UI in one file: it gates rendering on auth state, then renders 3 treasure boxes and tracks score/game-over state. There is no routing or state management library — all state is local `useState`/`useEffect` in `App.tsx`.
- Game assets (chest images, sounds) live in `src/assets/` and `src/audios/` and are imported directly into `App.tsx` as ES module imports (Vite handles bundling).
- Animations use `motion/react` (Motion, formerly Framer Motion) — `motion.div`, `whileHover`, `whileTap`, `initial`/`animate`/`transition`.

### Auth & persistence (Supabase)

- Backend is Supabase (Postgres + Auth), called directly from the browser via `@supabase/supabase-js` — there is no server/API layer in this repo. The package version is pinned exactly (not `^`) to `2.45.4` in `package.json` because newer versions pull in sub-dependencies requiring Node ≥22, which conflicts with this project's Node 18 pin.
- `src/lib/supabase.ts` creates the client singleton from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and exports `isSupabaseConfigured`. It falls back to placeholder values instead of throwing when env vars are missing, so a misconfigured `.env` shows a setup message in the UI instead of a blank crashed page.
- Login is passwordless email **magic link** (not OTP-code entry — the Supabase project this app targets can't have its Email Templates customized to surface `{{ .Token }}`, so a clickable link is the only viable flow). `App.tsx` drives this as a staged flow: `enter-email` → `awaiting-link` → (after the user clicks the emailed link and Supabase's client-side redirect handling restores the session) → `choose-nickname` (only when the account has zero nicknames yet) → `ready`.
- **One authenticated account can own multiple nicknames ("profiles")**, switchable from the right-hand panel without re-authenticating. `players.id` is an independent `gen_random_uuid()`, not `auth.uid()` — ownership is tracked via a separate `owner_uid` column (references `auth.users(id)`, not unique). `nickname` stays globally unique across all accounts. `plays` has no `owner_uid` of its own; its RLS policies join back to `players` to check ownership.
- `src/lib/player.ts` wraps all Supabase calls: `requestMagicLink`, `onAuthStateChange` (subscription-based; fires immediately with any existing/just-restored session, then on every sign-in/out), `fetchPlayerProfiles` (all nicknames for an `owner_uid`), `createPlayer`, `renamePlayer`, `fetchPlayCount`, `fetchPlayHistory` (recent individual plays, default limit 20), `recordPlay`, `logout`, plus `getLastActiveProfileId`/`setLastActiveProfileId` (localStorage, keyed by `owner_uid`, remembers which nickname this device last used so a returning login on the same device resumes it; a login from a device with no such record falls back to the oldest-created profile).
- In `App.tsx`, `nickname`/`playerId` are *derived* each render from `profiles: Player[]` + `activeProfileId`, not stored as separate state — don't reintroduce flat nickname/id state, it will drift out of sync with the profiles list.
- Switching or creating a nickname resets the current game board (`initializeGame()`) since scores are only ever persisted at game-end (`recordPlay` inside `openBox`), so there's nothing to lose — but both actions are deliberately disabled (via `isGameInProgress = boxes.some(b => b.isOpen) && !gameEnded`) while a box has already been opened in the current round, so a round in progress can't be abandoned mid-play. Renaming the active nickname is not gated by this, since it doesn't change which profile is active.
- Schema/RLS SQL and required Supabase dashboard setup (redirect URL config, since Email Templates can't be edited on this project) live in the plan doc history, not in this repo.
- `.env` (gitignored) holds the real `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`; `.env.example` is the tracked placeholder template — keep it as placeholders, not real values.

### UI components

- `src/components/ui/` is a full shadcn/ui component set (accordion, dialog, form, sidebar, etc.), generated boilerplate. Only `button.tsx` and `input.tsx` are currently used by `App.tsx` — treat the rest as an available component library rather than active app code.
- `src/components/figma/ImageWithFallback.tsx` is a Figma-import helper for images with fallback handling.
- Path alias `@` resolves to `src/` (configured in `vite.config.ts`), and the same file also aliases each versioned npm package name (e.g. `sonner@2.0.3`) back to its unversioned import — this is a carryover from Figma Make/Builder.io export and should be preserved when adding new Radix/shadcn dependencies.

### Styling

- Styling is Tailwind CSS v4, applied via utility classes directly in JSX (no CSS modules).
- **There is no live Tailwind build.** `src/index.css` (imported by `main.tsx`) is a large static, pre-generated snapshot of compiled utility classes — not a JIT compiler. `tailwindcss` isn't even in `package.json`. A class that wasn't already baked into that snapshot produces **no CSS and no error** — it just silently doesn't render. Before using a new utility class (especially arbitrary-value classes like `w-[123px]` or a responsive variant you haven't seen elsewhere in this file), grep for it in `src/index.css` first, or stick to classes already used elsewhere in `App.tsx`. Notably `md:flex-row` is **not** in the snapshot even though `md:grid-cols-3` is — don't assume a whole variant family is present just because one member of it is. Always visually verify layout changes in a browser; a missing class shows up immediately as unstyled/collapsed spacing.
- `src/styles/globals.css` defines the shadcn/ui design tokens (CSS custom properties for light/dark themes) and has real `@theme`/`@custom-variant` source directives, but is **not imported anywhere** in the app currently — it's a leftover from the design-system template. Wiring up a live build from this file is a reasonable escape hatch if a future change needs many new/arbitrary utility classes, but hasn't been necessary so far — one-off gaps have been routed around with equivalent already-present classes instead.
- `src/guidelines/Guidelines.md` is an empty shadcn template for project-specific AI design guidelines; nothing has been filled in yet.

## Deployment

- This is now a git repo, remote `origin` → `https://github.com/echochen2023/claude_code_treasure_game_by_echo.git`, pushed on branch `main`.
- Hosted on Vercel via the GitHub integration: any push to `main` auto-triggers a Production deployment, no `vercel` CLI involved (it isn't installed locally). Production URL: `https://claude-code-treasure-game-by-echo.vercel.app`.
- Vercel's Output Directory is manually overridden to `build` (its Vite preset defaults to `dist`, which doesn't match this project's `vite.config.ts` `build.outDir`).
- Vercel's Node.js Version (Project Settings → General) is set independently from this repo's `.nvmrc`; it only affects the build step, not local dev, so it isn't pinned down to Node 18 like local dev is.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set as Vercel **Config** type env vars, not Secret — Secret is write-only (can't be read back or converted after saving), and these values are meant to be public anyway (see Auth section above on the anon key).
- Supabase **Authentication → URL Configuration → Redirect URLs** must include the production URL, since magic-link login uses `emailRedirectTo: window.location.origin` — if the origin isn't allow-listed there, login breaks in production even though it works locally.
- `.claude/commands/deploy_vercel.md` is a custom `/deploy_vercel` command for the routine "commit → confirm → push → verify" deploy loop; it's for shipping local changes to an already-provisioned Vercel project, not for one-time setup (that's covered above).
- **Second deployment target: GitHub Pages**, independent of Vercel. The repo had to be made **public** for this — GitHub Pages on the Free plan doesn't work on private repos. Live at `https://echochen2023.github.io/claude_code_treasure_game_by_echo/`.
- Because GitHub Pages serves this as a project page (a subpath, not the domain root), `vite.config.ts`'s `base` is conditional: `process.env.GH_PAGES === 'true' ? '/claude_code_treasure_game_by_echo/' : '/'`. Plain `npm run build` (used by Vercel) stays at `base: '/'` — only the GitHub Pages build needs the subpath prefix, so don't hardcode one `base` for both targets.
- Deploy mechanism is the `gh-pages` npm package: `npm run deploy` runs `predeploy` (`GH_PAGES=true vite build`) then pushes `build/` to a `gh-pages` branch on `origin`, which GitHub Pages serves from directly (Settings → Pages → Source auto-configured itself off that branch after the first push, no manual dashboard step was needed).
- Supabase **Authentication → URL Configuration → Redirect URLs** needs the GitHub Pages origin added too, separately from the Vercel one — both origins must be allow-listed since each is a distinct `emailRedirectTo: window.location.origin` value.
- `.claude/commands/deploy_github_page.md` is the routine deploy command for this target, mirroring `/deploy_vercel`'s pattern (commit → confirm → push `main` → `npm run deploy` → verify).

## Notes

- This project was originally exported from a Figma/Builder.io design tool, which explains the versioned import aliasing in `vite.config.ts` and the presence of a full unused shadcn component library.
- `README.md` in this repo is a walkthrough script for a Claude Code tutorial (not project documentation) — do not treat its contents as setup instructions.
