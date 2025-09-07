# Agent Development Guide

A file for [guiding coding agents](https://agents.md/).

## Commands

- **Install:** `npm install`
- **Start producer:** `npm start`
- **Start consumer:** `npm run consumer`
- **Formatter:** `prettier -w .`

## Project Structure

- Producer (Jetstream to LavinMQ): `index.js`
- Consumer (LavinMQ reader): `consumer.js`
- Configuration: `.env` (copy from `.env.example`)

## Code style

- Avoid extra dependencies
