# ProPilot AI

AI assistant for real estate agents: answers Facebook Messenger inquiries from the agent's own listings, qualifies buyers, and routes hot leads to the agent's phone.

**Status:** beta in development. No live payments, no real Meta App Review yet.

## Repo layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js web app: dashboard, signup/login, billing, webhooks |
| `apps/mobile` | Expo app for iOS and Android: lead inbox and push notifications |
| `packages/shared` | Roles and permissions (`can()`), plan entitlements, Zod schemas, shared by all apps |
| `packages/db-tests` | Runs the real migrations in an in-memory Postgres and checks tenant isolation |
| `supabase/migrations` | Database schema and row-level security policies |

## Setup

Requirements: Node.js 22 LTS, pnpm 10, Git.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the values
pnpm --filter @propilot/web dev                  # http://localhost:3000
pnpm --filter @propilot/mobile start             # scan the QR code with Expo Go
```

### Supabase

1. Create a project at supabase.com (region: **Southeast Asia (Singapore)**).
2. Copy **Project URL** and **anon public key** (Project Settings → API) into `apps/web/.env.local`.
3. Apply the schema: install the Supabase CLI, then `supabase link --project-ref <ref>` and `supabase db push`.
   Or paste each file from `supabase/migrations/` into the SQL Editor in order.

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Public. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Public. Row-level security protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server only) | **Secret.** Bypasses RLS. Never prefix with `NEXT_PUBLIC_`. |

Later phases add PayMongo, Meta and Anthropic keys (listed, commented out, in `.env.example`).
Never commit `.env.local`; it's in `.gitignore`.

## Checks

```bash
pnpm test        # permissions/entitlements unit tests + cross-tenant RLS tests
pnpm typecheck
pnpm lint
pnpm build
```

## Security rules

- Every tenant table has `business_id` and an RLS policy. New tables need a policy **and** a test in `packages/db-tests`.
- Paid access is granted only by a verified payment webhook, never by the checkout success page.
- Provider tokens (Meta, PayMongo) are stored encrypted, server-side only.
- Seed and test data is labelled "(test)". No fake Facebook data in production.
