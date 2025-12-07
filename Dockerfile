FROM node:22 AS base

# Dockerize is needed to sync containers startup
ENV DOCKERIZE_VERSION v0.6.1
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz

# Enable corepack for pnpm
RUN corepack enable

RUN mkdir -p /app

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .

FROM base AS dependencies

RUN pnpm install --frozen-lockfile

FROM dependencies AS runtime

COPY . .
