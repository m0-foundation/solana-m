FROM node:22-alpine

LABEL org.opencontainers.image.source=https://github.com/m0-foundation/solana-m
LABEL org.opencontainers.image.description="Yield Bot"

WORKDIR /app

COPY *.json ./
COPY pnpm-*.yaml ./
COPY ./services/yield-bot ./services/yield-bot
COPY ./services/shared ./services/shared
COPY ./sdk ./sdk

RUN npm install -g pnpm ts-node && pnpm install --prod

ARG now
ENV NODE_ENV=production
ENV BUILD_TIME=$now

CMD ["sh", "-c", "ts-node ./services/yield-bot/main.ts distribute --programID \"$PROGRAM_ID\" --claimThreshold \"$CLAIM_THRESHOLD\""]
