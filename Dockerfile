FROM node:14 AS base

# Dockerize is needed to sync containers startup
ENV DOCKERIZE_VERSION v0.6.1
RUN wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-alpine-linux-amd64-$DOCKERIZE_VERSION.tar.gz

RUN mkdir -p /app

WORKDIR /app

COPY package.json .
COPY package-lock.json .

FROM base AS dependencies

RUN npm ci

FROM dependencies AS runtime

COPY . .
