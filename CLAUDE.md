# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an rssCloud Server v2 implementation in Node.js - a notification protocol server that allows RSS feeds to notify subscribers when they are updated. The server handles subscription management and real-time notifications for RSS/feed updates.

## Development Commands

This project uses pnpm with corepack. Run `corepack enable` to set up pnpm automatically.

### Start Development

- `pnpm start` - Start server with nodemon (auto-reload on changes)
- `pnpm run client` - Start client with nodemon

### Testing & Quality

- `pnpm test` - Run full API tests using Docker containers (MacOS tested)
- `pnpm run lint` - Run ESLint with auto-fix on controllers/, services/, test/

## Architecture

### Core Application Structure

- **app.js** - Main Express application entry point, sets up middleware, loads jsonStore from disk, and starts server
- **config.js** - Configuration management reading from env vars with defaults
- **controllers/** - Express route handlers for API endpoints
- **services/** - Business logic modules for core functionality
- **views/** - Handlebars templates for web interface

### Key Services

- **services/json-store.js** - Disk-backed in-memory store; the sole source of truth for resources and subscriptions. Flushes atomically to `./data/subscriptions.json` on an interval and at shutdown.
- **services/notify-\*.js** - Notification system for subscribers
- **services/ping.js** - RSS feed update detection and processing
- **services/please-notify.js** - Subscription management

### API Endpoints (defined in controllers/index.js)

- `/pleaseNotify` - Subscribe to RSS feed notifications
- `/ping` - Notify server of RSS feed updates
- `/viewLog` - Event log viewer for debugging
- `/RPC2` - XML-RPC endpoint
- Web forms available at `/pleaseNotifyForm` and `/pingForm`

### Configuration

Environment variables (with defaults in config.js):

- `DOMAIN` (default: localhost)
- `PORT` (default: 5337)
- `DATA_FILE_PATH` (default: `./data/subscriptions.json`)
- Resource limits: MAX_RESOURCE_SIZE, REQUEST_TIMEOUT, etc.

### Data Storage

State is persisted to a JSON file (default `./data/subscriptions.json`) managed by services/json-store.js. The store loads into memory at startup and flushes atomically on an interval and at shutdown. No external database is required.

### Testing

- Unit tests in test/ directory using Mocha/Chai
- Docker-based API testing with mock endpoints
- Test fixtures and SSL certificates in test/keys/

## Commits and Releases

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint via husky git hooks.

### Commit Format

```
type: description

[optional body]
```

### Commit Types

**Trigger releases:**
- `fix:` - Bug fixes → patch release (2.2.1 → 2.2.2)
- `feat:` - New features → minor release (2.2.1 → 2.3.0)
- `feat!:` or `BREAKING CHANGE:` → major release (2.2.1 → 3.0.0)

**No release triggered:**
- `chore:` - Maintenance tasks, dependencies
- `docs:` - Documentation only
- `style:` - Code style/formatting
- `refactor:` - Code refactoring
- `test:` - Adding/updating tests
- `ci:` - CI/CD changes
- `build:` - Build system changes

### Release Workflow

1. Push commits to `main`
2. release-please automatically creates/updates a Release PR
3. Review the Release PR (contains changelog and version bump)
4. Merge the Release PR when ready to release
5. release-please creates GitHub Release and git tag
