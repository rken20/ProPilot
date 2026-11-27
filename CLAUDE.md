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

## New features: cost and profit heads-up first

Owner's standing request (27 Nov 2026): whenever a new feature is proposed or asked for, say before
building it whether it is profitable and plausible. Give, in a few lines:

- what it costs MyHomeSeller per use and per subscriber a month (AI tokens, web searches, SMS,
  storage, third-party fees), with the prices looked up, not remembered;
- which plans it fits, and whether it needs a monthly limit, AI credits or a paid add-on;
- a verdict: add, add with a cap, paid add-on only, later, or don't add;
- any clash with the ground rules (a person approves outside messages, the owner decides prices
  and boost spend, real numbers only, video ads show photos unaltered).

The cost model is the "MyHomeSeller costs per feature and future features" Sheet
(https://claude.ai/artifact/7DGPaomWUXHsrNyzocuHuN): read its current prices and usage before
estimating, and add the new feature's row there once the owner decides. Current AI limits a month:
replies 3,000 / 6,000 / 15,000 and Ask MyHomeSeller 150 / 400 / 1,000 (Basic / Pro / Agency); past
them, AI credits (1 a reply, 2 a question).
