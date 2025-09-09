# Agent Development Guide

A file for [guiding coding agents](https://agents.md/).

## Commands

### Setup
- **Install:** `npm install`

### Producer (Jetstream to LavinMQ)
- **Start producer:** `npm start`

### Web Viewer (Recommended)
- **Start web server:** `npm run serve` (serves on http://localhost:8000)
- **Alternative:** `python3 -m http.server 8000`
- **Features:** Real-time streaming, filtering, statistics, responsive UI

### Command-line Consumer 
- **Start consumer (unlimited):** `npm run consumer` or `node consumer.js`
- **Get sample messages:** `node consumer.js 10` (fetches 10 messages and stops)
- **Filter by language:** `node consumer.js --lang en` (English messages only)  
- **Filter by type:** `node consumer.js --posts-only` (text posts only)
- **Combined filters:** `node consumer.js --lang ja --posts-only` (Japanese text posts)
- **Save messages to file:** `node consumer.js 100 > samples.json`

### Development
- **Formatter:** `prettier -w .`

## Project Structure

- **Producer (Jetstream to LavinMQ):** `index.js`
- **Web Viewer:** `index.html` (with AMQP WebSocket client)
- **Command-line Consumer:** `consumer.js`
- **Configuration:** `.env` (copy from `.env.example`)

## Web Viewer Details

The web-based stream viewer (`index.html`) provides:
- Direct AMQP WebSocket connection to LavinMQ (no separate server needed)
- Real-time message filtering by type and language
- Live statistics display (rates, types, languages)
- Responsive design for desktop and mobile
- Support for 45+ languages including English, Japanese, Spanish, etc.

**To use:** Run `npm run serve`, open http://localhost:8000, click "Start Stream"

## Code style

- Avoid extra dependencies
