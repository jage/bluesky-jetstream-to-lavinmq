# Bluesky Streams

A Node.js application that consumes the Bluesky Jetstream firehose via WebSocket and publishes messages to a LavinMQ stream queue.

- LavinMQ streams documentation: https://lavinmq.com/documentation/streams
- Bluesky Jetstream documentation: https://github.com/bluesky-social/jetstream

## TODO:

- Add `x-stream-filter-value` and message headers like `type: post`, `date: 2025-08-27`, `language: en`
- Look at compression, make sure we can store lots of data

## Installation

```bash
npm install
```

## Configuration

Set the following environment variables:

- `AMQP_URL`: LavinMQ connection URL (default: `amqp://localhost:5672`)
- `STREAM_NAME`: Queue name for publishing messages (default: `bluesky-stream`)

## Usage

### Producer (Jetstream to LavinMQ)

Start the producer to consume from Bluesky Jetstream and publish to LavinMQ:

```bash
npm start
```

Or with custom configuration:

```bash
AMQP_URL=amqp://user:pass@localhost:5672 STREAM_NAME=my-stream npm start
```

### Consumer (Read from LavinMQ)

The consumer can run in two modes:

#### Unlimited consumption (runs until stopped)
```bash
npm run consumer
# or
node consumer.js
```

#### Limited consumption (fetches N messages and stops)
```bash
node consumer.js 10                       # Get 10 messages as JSON array
node consumer.js 100 > samples.json       # Get 100 messages and save to file
```

**Consumer Options:**
- `--help`: Show usage help

## Features

- Connects to Bluesky Jetstream WebSocket feed
- Publishes all messages to LavinMQ stream queue
- Automatic reconnection with exponential backoff
- Graceful shutdown handling
- Minimal dependencies (ws, amqp-client.js)

## Dependencies

- `ws`: WebSocket client for connecting to Bluesky Jetstream
- `amqp-client.js`: AMQP client for LavinMQ integration
