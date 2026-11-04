# Deploying Slack Authentication

How to ship the Slack-login version of Pitch Labs Network when you're ready.

## Current status

- The auth code is **implemented and committed locally on `main`, but NOT pushed**
  (commits `3a56b7f`, `66afeb0`, `8f920ef`).
- **Production is still the pre-auth build** — anyone can use the "Viewing as"
  switcher without an account. This is intentional, so the demo stays open.
- **Pushing `main` deploys auth** and replaces the switcher with required Slack
  login. Don't push until you want that.

## Already configured (one-time — done, no action needed)

- **Supabase** project `ebrfgxeohgfpfenihkkf`:
  - Slack (OIDC) provider enabled with the Slack app's Client ID + Secret.
  - Auth → URL Configuration: Site URL `https://pitch-labs-network.vercel.app`;
    redirect allow-list includes `http://localhost:3000/auth/callback` and
    `https://pitch-labs-network.vercel.app/auth/callback`.
- **Slack app** (api.slack.com/apps): "Sign in with Slack" (OpenID Connect),
  scopes `openid email profile`, redirect URL
  `https://ebrfgxeohgfpfenihkkf.supabase.co/auth/v1/callback`.
- **Database**: this Supabase project is **production only**. Local development and
  staging use a separate non-production project (see "Environments" in `README.md`).
  Production has a member row for testing: advisor "Daniel Reyes" with email
  `kaan@pitchlabs.net`.

## To deploy (when ready)

### 1. Add Vercel env vars FIRST — before the build runs

`NEXT_PUBLIC_*` vars are **inlined into the client bundle at build time**, so they
must exist in Vercel *before* the deploy builds, or the Slack button ships broken.

In **Vercel → Settings → Environment Variables**, add to **Production + Preview**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ebrfgxeohgfpfenihkkf.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (Supabase → Settings → API) |

(`DATABASE_URL` and `DIRECT_URL` are already set from the earlier deploy. The
publishable key is browser-safe by design — fine to expose.)

### 2. Push to deploy

```
git push origin main
```

Vercel auto-builds and deploys. Because the env vars are set, the new build picks
them up. (If you ever add the vars *after* a deploy, trigger a **Redeploy**.)

### 3. Remove Deployment Protection (optional)

If Vercel Deployment Protection is on from the demo phase, you can remove it now —
Slack login gates the app. **Vercel → Settings → Deployment Protection**.

## Membership (allowlist)

A Slack login only works if the email matches an existing `Advisor.email` or
`Founder.email`. Unknown emails land on `/no-access`. Add members by setting those
emails — Supabase Table Editor, or a one-off Prisma update, e.g.:

```js
await prisma.advisor.update({
  where: { email: "someone@old.example" },
  data:  { email: "newmember@theircompany.com" },
});
```

Advisor takes precedence if an email exists in both tables.

## Verify production

1. Visit `https://pitch-labs-network.vercel.app` → should redirect to `/login`.
2. **Sign in with Slack** → lands on the advisor/founder workspace.
3. A Slack email in neither table → `/no-access`.

## Rollback

Redeploy the previous (pre-auth) deployment from the Vercel **Deployments** tab,
or revert the auth commits and push.

## Key files (reference)

- `proxy.ts` — route protection (this Next version's renamed middleware)
- `lib/supabase/{server,client}.ts` — Supabase SSR clients
- `app/login/`, `app/auth/callback/route.ts`, `app/no-access/` — auth flow
- `lib/session.ts` — maps the Slack email (quote-stripped, lowercased) to a row
- `app/actions.ts` — `signOut` + ownership checks on advisor actions

## Non-production environments

Setup for the non-production Supabase project (staging + local development):

1. Create the project; enable the Slack (OIDC) provider with the same Slack app's
   Client ID and Secret.
2. Auth → URL Configuration: Site URL = the staging domain; redirect allow-list =
   `http://localhost:3000/auth/callback` and `https://<staging-domain>/auth/callback`.
3. Slack app → Redirect URLs: add `https://<nonprod-ref>.supabase.co/auth/v1/callback`.
4. Vercel → Environment Variables:
   - Preview, branch `staging`: the four variables from `.env.example`, with
     `?schema=staging` added to both `DATABASE_URL` and `DIRECT_URL`.
   - Development: the same four variables on the default `public` schema.
5. Vercel → Domains: assign the staging domain to the `staging` git branch, and keep
   Deployment Protection on.
6. Seed each schema and create your admin (`npm run seed`, `npm run make-admin`;
   for the staging schema run them with `?schema=staging` on the URLs).

Staging deploys run `prisma migrate deploy` during the build (`scripts/migrate-on-build.ts`),
and the build aborts if the staging variables point at production. Production
migrations are manual: `npm run db:migrate:prod`.
