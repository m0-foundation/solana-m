# syntax=docker.io/docker/dockerfile:1.7-labs

FROM node:lts-alpine AS build

WORKDIR /app

# Copy local code to the container image.
COPY --exclude=node_modules . ./

# Build the app.
RUN yarn install
RUN yarn run build

# Use the Caddy image
FROM caddy

# Create and change to the app directory.
WORKDIR /app

# Copy Caddyfile to the container image.
COPY Caddyfile ./

# Copy local code to the container image.
RUN caddy fmt Caddyfile --overwrite

# Copy files to the container image.
COPY --from=build /app/dist ./dist


LABEL org.opencontainers.image.source https://github.com/m0-foundation/solana-m
LABEL org.opencontainers.image.description "Solana Dashboard"

# Use Caddy to run/serve the app
CMD ["caddy", "run", "--config", "Caddyfile", "--adapter", "caddyfile"]
