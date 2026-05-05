# Agent Development Guide

## Commands

- **Install:** `npm install`
- **Run everything (recommended):** `docker compose up` — brings up LavinMQ + producer + viewer
- **Run producer only (LavinMQ must already be running):** `npm start`
- **Format:** `prettier -w .`

## Project layout

- `index.js` — Producer: subscribes to Bluesky Jetstream, publishes to LavinMQ, also serves the viewer over HTTP.
- `index.html` — Browser viewer: connects to LavinMQ over AMQP-over-WebSocket and demonstrates `x-stream-filter`.
- `Dockerfile`, `docker-compose.yml` — Single-command local stack (LavinMQ + producer).

## What this demo is for

Demonstrating LavinMQ **stream filtering**. The producer tags messages with `bs.type`, `bs.lang`, `bs.has_media`, `bs.date` headers; the viewer subscribes with matching `x-stream-filter` arguments. Keep additions aligned with that focus — extra headers, alternate transports, or auxiliary CLIs dilute the demo.

## Code style

- Avoid extra dependencies.
- Match the existing `at=info event=...` log style in `index.js`.
