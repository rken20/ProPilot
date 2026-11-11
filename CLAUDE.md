# ProPilot AI: notes for Claude

## Design skill

`.claude/skills/design-taste-frontend` is a vendored copy of
[taste-skill](https://github.com/Leonxlnx/taste-skill) 2.5.1 (MIT, upstream commit f6b7657).

Use it only for **public marketing pages** (the home/landing page and any future marketing pages).
Do not apply it to the signed-in app (`/app`, `/buyer`, auth screens): those follow the app's own
design system in `apps/web/src/app/globals.css` and `components/ui.tsx`. Its static-export
requirement must not be applied to the whole Next.js app, which needs server rendering for auth.

Update it by re-copying `skills/taste-skill` from upstream; don't hand-edit its files.
