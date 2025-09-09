# Agent Development Guide

A file for [guiding coding agents](https://agents.md/).

## Commands

- **Install:** `npm install`
- **Start producer:** `npm start`
- **Start consumer (unlimited):** `npm run consumer` or `node consumer.js`
- **Get sample messages:** `node consumer.js 10` (fetches 10 messages and stops)
- **Filter by language:** `node consumer.js --lang en` (English messages only)  
- **Filter by type:** `node consumer.js --posts-only` (text posts only)
- **Combined filters:** `node consumer.js --lang ja --posts-only` (Japanese text posts)
- **Save messages to file:** `node consumer.js 100 > samples.json`
- **Formatter:** `prettier -w .`

## Project Structure

- Producer (Jetstream to LavinMQ): `index.js`
- Consumer (LavinMQ reader): `consumer.js`
- Configuration: `.env` (copy from `.env.example`)

## Code style

- Avoid extra dependencies
