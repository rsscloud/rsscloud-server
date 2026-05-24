FROM node:22 AS base

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/e2e/package.json apps/e2e/
COPY packages/core/package.json packages/core/

FROM base AS dependencies

RUN pnpm install --frozen-lockfile --filter @rsscloud/server --prod --ignore-scripts

FROM dependencies AS runtime

COPY apps/server apps/server

WORKDIR /app/apps/server

CMD ["node", "--use_strict", "app.js"]
