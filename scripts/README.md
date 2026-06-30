# Scripts

## docker-build-push.sh

Builds the server Docker image (`apps/server/Dockerfile`) and pushes it to Docker
Hub as `andrewshell/rsscloud-server`.

### Features

- ✅ **Quality checks** — runs `typecheck`, `lint`, and unit tests before building
- 🐳 **Docker validation** — checks Docker is running and you're authenticated
- 🏷️ **Smart tagging** — tags with the version from `apps/server/package.json` + `latest`
- 🎯 **Custom tags** — pass an extra tag as a positional argument
- 🚀 **Multi-platform** — builds `linux/amd64` and `linux/arm64` via `docker buildx`
- 🔍 **Dry run** — preview the tags without building/pushing

### Usage

```bash
# Full build with quality checks
pnpm docker:build-push

# Skip quality checks for quick iterations
pnpm docker:build-push-skip-quality

# Dry run — show what would happen without building/pushing
pnpm docker:dry-run

# Direct script usage (e.g. with a custom tag)
./scripts/docker-build-push.sh beta
./scripts/docker-build-push.sh --help
```

### Requirements

- Docker installed and running, with `buildx`
- Docker Hub authentication (`docker login`) — the script prompts if needed
- Node.js + pnpm
- Run from the repository root

### Tags pushed

- `andrewshell/rsscloud-server:<version>` (from `apps/server/package.json`)
- `andrewshell/rsscloud-server:latest`
- `andrewshell/rsscloud-server:<custom-tag>` (if provided)

### Running the published image

The server keeps subscriptions/stats on disk under `/app/apps/server/data`, so
mount a volume there to persist state across restarts. Set `DOMAIN`/`HUB_URL` to
the externally-reachable host so the hub advertises the right callback URL.

```bash
docker run -d -p 5337:5337 \
  -e DOMAIN=cloud.example.com \
  -e HUB_URL=https://cloud.example.com/websub \
  -v rsscloud-data:/app/apps/server/data \
  andrewshell/rsscloud-server:latest
```

> The `docker-compose.yml` under `apps/e2e/` relaxes the SSRF egress protection so
> the test mock servers are reachable. A real deployment should **not** copy those
> `WEBSUB_*_ALLOW_CIDRS` / SSRF env vars — keep the strict defaults.
