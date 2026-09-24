# Deploying DemoRiff to Lightsail

One server runs everything: Postgres, the web app, the render worker, and
Caddy for HTTPS. `scripts/lightsail.sh` creates it, points demoriff.com at
it, deploys, and removes it again.

## First time

1. **Settings.** `scripts/lightsail.sh init` creates `deploy/.env.production`
   with generated secrets and your vendor keys from `.env.local`. Fill in:
   - `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` — nobody can sign in without them;
     email-only sign-in is off in production.
   - the live Stripe keys and prices, and `STRIPE_WEBHOOK_SECRET` once the
     live webhook exists (see `.env.stripe-webhooks.txt`).
   - `ACME_EMAIL`, for certificate expiry notices.

   Keep a copy of this file in a password manager. `DEMORIFF_SECRET_KEY`
   encrypts stored keys; if it is lost they cannot be read.

2. **Docker Desktop** running on this machine, with Rosetta turned on
   (Settings → General → "Use Rosetta for x86_64/amd64 emulation"). The
   server is x86, so the image is built for it here.

3. **Create it:** `scripts/lightsail.sh up`. It shows the AWS account and
   Route 53 zone it found, asks you to type `yes`, then creates the server
   (4 GB, $24/month), a static IP, the firewall, daily snapshots and the DNS
   records, and deploys. The first HTTPS certificate arrives a minute or two
   after DNS updates.

## After that

| Command | Does |
|---|---|
| `scripts/lightsail.sh deploy` | Build, ship, migrate, restart. |
| `scripts/lightsail.sh status` | Server, IP, DNS, and whether the site answers. |
| `scripts/lightsail.sh logs` | Follow the web and worker logs. |
| `scripts/lightsail.sh ssh` | A shell on the server. |
| `scripts/lightsail.sh backup` | Download a database dump to `deploy/backups/`. |
| `scripts/lightsail.sh allow-ssh` | Your IP changed and SSH stopped working. |
| `scripts/lightsail.sh destroy` | Remove it (below). |

## Destroy

Asks you to type the domain name, and only runs at a keyboard. Before
deleting anything it downloads a database dump and takes a final snapshot
of the server's disk, which holds every recording. It removes the DNS
records only if they still point at this server, releases the static IP,
and deletes the server. The dump, the snapshot and the SSH key are kept.
It never touches a server it did not create (it checks for its tag).

## Defaults

`AWS_PROFILE=dplouffe`, `REGION=us-east-1`, `DOMAIN=demoriff.com`,
`NAME=demoriff`, `BUNDLE=medium_3_0`. Override any of them on the command
line, e.g. `BUNDLE=large_3_0 scripts/lightsail.sh up`.

Files are stored on the server's disk and included in its daily snapshots.
Moving them to S3 or Cloudflare R2 later is a settings change.
