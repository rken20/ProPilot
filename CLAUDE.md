# ProPilot AI: notes for Claude

## Design skill

`.claude/skills/design-taste-frontend` is a vendored copy of
[taste-skill](https://github.com/Leonxlnx/taste-skill) 2.5.1 (MIT, upstream commit f6b7657).

Use it only for **public marketing pages** (the home/landing page and any future marketing pages).
Do not apply it to the signed-in app (`/app`, `/buyer`, auth screens): those follow the app's own
design system in `apps/web/src/app/globals.css` and `components/ui.tsx`. Its static-export
requirement must not be applied to the whole Next.js app, which needs server rendering for auth.

Update it by re-copying `skills/taste-skill` from upstream; don't hand-edit its files.

## Engineering skills

`.claude/skills/*` (all except `design-taste-frontend`), `.claude/references/` and `.claude/agents/` are a vendored copy of
[addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) (MIT, upstream commit 301b02b, license in
`.claude/skills/AGENT-SKILLS-LICENSE`). Their hooks and Gemini command files are not installed.

Where they disagree with this file, this file wins. In particular, this is a solo beta: committing straight to `main`
is fine (Vercel deploys `main`), and every new table still needs an RLS policy plus a test in `packages/db-tests`.

Update them by re-copying from upstream; don't hand-edit their files.
