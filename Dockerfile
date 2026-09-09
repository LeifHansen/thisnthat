# syntax = docker/dockerfile:1

ARG NODE_VERSION=22.21.1
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Next.js/Prisma"
LABEL org.opencontainers.image.title="thisnthat"
LABEL org.opencontainers.image.description="This'n'that resale marketplace (Next.js + Prisma)"

WORKDIR /app
ENV NODE_ENV="production"

# Build stage
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp openssl pkg-config python-is-python3

# Prisma schema must exist before `npm ci` (postinstall runs prisma generate)
COPY package-lock.json package.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

# Copy application code
COPY . .

# NEXT_PUBLIC_* are baked into the client bundle at build time, so these public
# values must arrive as build args, passed via fly.toml + the deploy workflow.
# The Stripe publishable key is deliberately NOT among them: it is read at
# request time from STRIPE_PUBLISHABLE_KEY (src/lib/stripePublic.ts) so it can be
# set or rotated with `fly secrets set` without rebuilding the image.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID}

# Build (prisma generate is also run via the build script)
RUN npx next build

# Final stage
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y openssl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

COPY --from=build /app /app

# Fly proxy targets internal_port 8080; make Next listen there. `next start`
# reads PORT from the environment (commander `.env("PORT")`) but has no such
# binding for the host — it passes undefined to server.listen(), which binds
# every interface over IPv6 dual-stack, so both the proxy's IPv4 hop and 6PN
# reach it. HOSTNAME is therefore inert for `next start`; it is set because the
# standalone `server.js` entry point does read it, and defaults to localhost.
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT [ "/app/docker-entrypoint.js" ]

EXPOSE 8080
# The `next` binary directly, NOT `npm run start`. npm is a second full Node
# program — thousands of small files — read off a cold page cache on a shared
# vCPU before it does anything but spawn this exact command, and that sat on
# the critical path while Fly's proxy counted down to its ~8.4s cutoff. Keep
# this in step with the `start` script in package.json, which is what a
# developer runs locally.
CMD [ "/app/node_modules/.bin/next", "start" ]
