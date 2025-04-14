# syntax=docker.io/docker/dockerfile:1.7-labs

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY tsconfig.json ./
COPY --exclude=node_modules ./services/yield-bot ./services/yield-bot
COPY --exclude=node_modules ./sdk ./sdk

# Install dependencies and build
RUN yarn init -y && \
    yarn add typescript ts-node && \
    cd ./services/yield-bot && yarn install && \
    cd ../../sdk && yarn install

# Production stage
FROM node:22-alpine

LABEL org.opencontainers.image.source https://github.com/m0-foundation/solana-m
LABEL org.opencontainers.image.description "Yield Bot"

WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/services/yield-bot ./services/yield-bot
COPY --from=builder /app/sdk ./sdk
COPY --from=builder /app/node_modules ./node_modules

# Set production environment and add build time
ARG now
ENV NODE_ENV=production
ENV BUILD_TIME=$now
ENV LOKI_URL=$LOKI_URL

# Use the environment variable in the command
CMD ["sh", "-c", "node_modules/.bin/ts-node ./services/yield-bot/main.ts distribute --keypair \"$BOT_KEYPAIR\" --rpc \"$SVM_RPC\" --programID \"$PROGRAM_ID\" --claimThreshold \"$CLAIM_THRESHOLD\""]
