# Access setup runbook

Terry runs every step on this page himself. RFC 2119 keywords; the capitals are load-bearing. A Claude
session MUST NOT change his Cloudflare account, MUST NOT see the service token secret, and MUST NOT
read or create anything under `%USERPROFILE%\.secrets`. Written 2026-11-13 against the Cloudflare docs
cited in each step; dashboard labels move, so a label that differs slightly is not a reason to stop.

The goal ([`contract/api.md`](../../contract/api.md) section 2): every request to
`swimcoach.sixbuckssolutions.workers.dev` MUST pass Cloudflare Access, `/healthz` included. Your phone
and browsers use a login session. The CLI uses one service token.

## What the docs say about Access on `workers.dev` (RISK 9, resolved on paper)

Cloudflare supports it. The Workers docs page
<https://developers.cloudflare.com/workers/configuration/cloudflare-access/> says Worker-level Access
protection covers the `workers.dev` hostname, routes, Custom Domains and previews, and that Access can
protect a Worker's production `workers.dev` URL, its preview URLs, or both. The same page names a
hostname-based alternative: a self-hosted application in Zero Trust with the `workers.dev` hostname as
the application domain. The general Access pages
(<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>)
say the domain must belong to an active zone, and they do not mention `workers.dev`. So the Worker-level
route in step 4 is the one to use; the hostname-based app is a second route, and a custom hostname is the
fallback in step 11.

**This is documentation, not proof.** Nobody has run it on this account. Step 10 (`check-access.ps1`)
is the proof, and the Worker MUST NOT be treated as protected until it passes.

Caveats from that page that touch swimcoach: Worker-level policies do not support WebSockets (swimcoach
uses none), and `ctx.access` is not passed to a Worker with static assets (swimcoach does not use it: the
Worker verifies the `Cf-Access-Jwt-Assertion` header itself, `contract/api.md` section 2).

## Steps that change your account

Steps 2, 3, 4, 5, 6 and 8 create or change something on your Cloudflare account. Step 7 writes one local
file. Steps 1, 9 and 10 only read or test (step 10 sends three requests to the Worker's `/healthz`).

## 1. Look for an existing Zero Trust organization (reads only)

1. Open <https://dash.cloudflare.com/>, select the account that owns the `swimcoach` Worker, then open
   **Zero Trust** in the left sidebar.
2. If a team already exists, its name shows under **Zero Trust > Settings**. Skip to step 3. Your team
   domain is then `<team name>.cloudflareaccess.com`.
3. If Zero Trust asks you to create an organization, continue with step 2.

## 2. Create the Zero Trust organization (CHANGES YOUR ACCOUNT)

Source: <https://developers.cloudflare.com/cloudflare-one/setup/>.

1. Choose a **team name**. It becomes `<team name>.cloudflareaccess.com`, the login host for every Access
   app. Pick one you can live with: the docs do not say it can be renamed later.
2. Choose the **Zero Trust Free** plan.
3. **Expect a payment-method prompt.** Per the docs, onboarding requires payment details even on the Free
   plan, and the Free plan is not charged. Enter them yourself. A Claude session MUST NOT enter them.
4. Finish onboarding. Note the team name.

## 3. Turn on One-time PIN login (CHANGES YOUR ACCOUNT)

Source: <https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/>.

A new organization starts with only the Cloudflare account login method, so One-time PIN is not on by
default.

1. Go to **Zero Trust > Integrations > Identity providers**.
2. Select **Add new identity provider**, then **One-time PIN**, then save.
3. To use another login method (Google, GitHub, or another provider), add it on the same page instead or
   as well. The login page lists every method you added and you pick one each time. Each provider has its
   own setup guide linked from that page. One-time PIN is the default for swimcoach because it needs no
   extra account.

A PIN is emailed to the address you type, lasts 10 minutes and works once.

## 4. Protect the Worker with Access (CHANGES YOUR ACCOUNT)

Source: <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>.

1. In the dashboard go to **Workers & Pages** and select the `swimcoach` Worker.
2. Open the **Access** tab, then select **Protect this Worker behind Access**.
3. Choose **All traffic**. **Previews only** would leave the production URL public, and that fails the
   goal.
4. Under **Authentication policy**, the dashboard offers only **Cloudflare account** and **Email domain**.
   Choose **Cloudflare account** for now, so the application can be saved. You replace the policy in step 5.
5. Select **Apply Access**.
6. Open **Zero Trust > Access controls > Applications** and find the application this created (its
   domain is `swimcoach.sixbuckssolutions.workers.dev`). If you find no such application, or the Worker's
   Access tab gives an error, stop and use the hostname-based route: in **Zero Trust > Access controls >
   Applications** select **Create new application > Self-hosted and private > Add public hostname**, pick
   or type `swimcoach.sixbuckssolutions.workers.dev` as the domain, and continue at step 5. If that also
   fails, go to step 11.

## 5. Create the two policies (CHANGES YOUR ACCOUNT)

Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/policies/>. Access denies
everything that no policy admits. A service token does NOT pass an Allow policy, and a person does NOT
pass a Service Auth policy, so you need both.

1. In **Zero Trust > Access controls > Policies**, select **Add a policy** (or add it from inside the
   application).
2. **Policy 1, you:** name `terry`, action **Allow**, rule **Include** with the **Emails** selector set to
   your own address. Save.
3. **Policy 2, the CLI:** name `swimcoach-cli`, action **Service Auth** (not Allow), rule **Include**
   with the **Service Token** selector set to the token from step 6. Create the token first (step 6), then
   return and save this policy. The Service Token selector is only offered under the Service Auth action.
4. Open the application from step 4, edit it, and attach both policies. Remove the **Cloudflare
   account** policy from step 4, or the whole Cloudflare account admits itself.
5. Under the application's login methods, leave **One-time PIN** selected, plus any provider you added in
   step 3.

## 6. Create the service token (CHANGES YOUR ACCOUNT)

Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>.

1. Go to **Zero Trust > Access controls > Service credentials > Service Tokens**.
2. Select **Create Service Token**. Name it `swimcoach-cli`.
3. Choose a duration. The docs show one year (`8760h`) and two years (`17520h`); a longer or
   non-expiring option, if the dashboard offers one, is your call. **An expired token makes every CLI
   call exit 5, so put the expiry date in your calendar.**
4. Select **Generate token**.
5. **The Client Secret is shown once.** Copy the Client ID and the Client Secret straight into the file
   in step 7. Do not paste either into chat, a repository, an environment variable, a ticket or a note.
   If you lose the secret, the fix is a new token (or a rotated one) and a new file.
6. Go back to step 5.3 and finish the `swimcoach-cli` policy.

## 7. Write the CLI config file (local file only)

Source for the shape: [`contract/cli.md`](../../contract/cli.md) section 5.

1. Create the folder `%USERPROFILE%\.secrets\swimcoach` if it is missing.
2. Create `%USERPROFILE%\.secrets\swimcoach\cli.json`, UTF-8 JSON, with exactly this shape:

```json
{
  "url": "https://swimcoach.sixbuckssolutions.workers.dev",
  "access_client_id": "<CLIENT ID FROM STEP 6>",
  "access_client_secret": "<CLIENT SECRET FROM STEP 6>"
}
```

3. The Client ID looks like `<hex>.access`. Keep the `url` free of a trailing path.
4. The file is the ONLY place the secret lives. `scripts/check-access.ps1` and the CLI both read it
   there and nothing else.

## 8. Set the session duration (CHANGES YOUR ACCOUNT)

Source: the Session Duration field in
<https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/>.

1. Edit the application from step 4. Find **Session Duration**.
2. Set it as long as the dashboard allows: the longest option (1 month, if offered). This is a
   single-user board on your own phone, and the in-app browser on the iPhone keeps its own storage, so
   every expiry costs you a PIN login (`docs/planning/RESUME.md` risk 8). Shorten it later if you want.
3. The session duration governs your browser login only. It does not affect the service token.
4. Save the application.

## 9. Read the two values the Worker needs (reads only)

Source: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>.

1. **Team domain** (becomes `ACCESS_TEAM_DOMAIN`): `<team name>.cloudflareaccess.com`, with no
   `https://` and no trailing slash. The Worker builds `https://<ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs`
   from it. Your team name is under **Zero Trust > Settings**.
2. **AUD tag** (becomes `ACCESS_AUD`): **Zero Trust > Access controls > Applications**, select **Edit**
   on the swimcoach application, then under **Additional settings** copy the **Application Audience
   (AUD) Tag**. It is a long hex string.
3. Neither value is a secret, so you MAY paste both to the Lead. The Lead sets them as the Worker
   variables `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`. Until both are set, the Worker answers 401 to
   everything (`contract/api.md` section 2: it fails closed).

## 10. Prove it

Run, in PowerShell 7:

```
pwsh -File scripts\check-access.ps1
```

It reads `cli.json`, never prints the secret, and sends the token only to the `url` in that file. It
checks `GET /healthz` three ways and prints one line each:

| Check | Passes when |
| --- | --- |
| (a) No credentials | The answer is a redirect to a `*.cloudflareaccess.com` host, or a 401 or 403 that did not come from the Worker |
| (b) Service token | HTTP 200 |
| (c) Right ID, wrong secret | Refused the same way as (a) |

It exits 0 when all three pass, 1 when a check fails, and 2 when `cli.json` is unusable. Check (b)
passes only after step 9's values are set in the deployed Worker, because the Worker verifies the token
too. Until then expect (b) to show HTTP 401: that is the Worker failing closed, not an Access fault.

After it passes, open the Worker URL in the iPhone browser, log in with a PIN, and confirm the board
loads. That test MUST run on the phone (`docs/planning/RESUME.md` risk 8).

## 11. Fallback: a custom hostname

If Access will not attach to `workers.dev` (step 4.6 fails, or step 10 (a) shows HTTP 200), the fallback
is a custom hostname on a zone in your account. The Access docs require the domain to belong to an active
zone. The work: add a Custom Domain to the Worker, create the self-hosted application for that hostname
(step 4.6, second route), then repeat steps 5 to 10 with the new hostname in `cli.json`. It also adds Workers
Routes Edit and DNS Edit permissions on that zone to the deploy token (`docs/planning/RESUME.md`,
hostname item 1). Tell the Lead before you start, and disable the `workers.dev` route afterward under the
Worker's **Settings > Domains & Routes** so no unprotected hostname remains.
