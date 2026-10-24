# DemoRiff: one image for the web app and the render worker.
#
# The same image runs as both: `next start` for the web, the worker script
# for renders. ffmpeg (with libass, for burned-in captions) and the bundled
# render fonts are in it, so a render looks the same wherever it runs.
#
# Built for linux/amd64 by scripts/lightsail.sh; see deploy/README.md.

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Inlined into client code at build time, so it is a build argument.
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# Without it, auth callbacks fall back to the request's own URL, which
# behind Caddy is 0.0.0.0:3000 — and WorkOS rejects that.
RUN test -n "$NEXT_PUBLIC_SITE_URL" || { echo "NEXT_PUBLIC_SITE_URL build arg is required" >&2; exit 1; }
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Everything, dev dependencies included: the worker runs through tsx and
# migrations through drizzle-kit, both of which live there.
COPY --from=build /app /app
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
