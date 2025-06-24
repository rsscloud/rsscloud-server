# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an rssCloud Server v2 implementation in Node.js - a notification protocol server that allows RSS feeds to notify subscribers when they are updated. The server handles subscription management and real-time notifications for RSS/feed updates.

## Development Commands

### Start Development

- `npm start` - Start server with nodemon (auto-reload on changes)
- `npm run client` - Start client with nodemon

### Testing & Quality

- `npm test` - Run Mocha test suite (called by test-api)
- `npm run test-api` - Run full API tests using Docker containers (MacOS tested)
- `npm run jshint` - Run JSHint linter
- `npm run eslint` - Run ESLint with auto-fix on controllers/, services/, test/

### Data Management

- `npm run import-data` - Import data using bin/import-data.js

## Architecture

### Core Application Structure

- **app.js** - Main Express application entry point, sets up middleware, MongoDB connection, and starts server
- **config.js** - Configuration management using nconf (env vars, CLI args, defaults)
- **controllers/** - Express route handlers for API endpoints
- **services/** - Business logic modules for core functionality
- **views/** - Handlebars templates for web interface

### Key Services

- **services/mongodb.js** - MongoDB connection management with graceful shutdown
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

- `MONGODB_URI` (default: mongodb://localhost:27017/rsscloud)
- `DOMAIN` (default: localhost)
- `PORT` (default: 5337)
- Resource limits: MAX_RESOURCE_SIZE, REQUEST_TIMEOUT, etc.

### Database

Uses MongoDB for storing subscriptions and resource state. Connection handled through services/mongodb.js with proper cleanup on shutdown.

### Testing

- Unit tests in test/ directory using Mocha/Chai
- Docker-based API testing with mock endpoints
- Test fixtures and SSL certificates in test/keys/
