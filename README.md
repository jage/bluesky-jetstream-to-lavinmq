# Bluesky Streams

A Node.js application that consumes the Bluesky Jetstream firehose via WebSocket and publishes messages to a LavinMQ stream queue. Includes both a command-line interface and a web-based real-time viewer.

- LavinMQ streams documentation: https://lavinmq.com/documentation/streams
- Bluesky Jetstream documentation: https://github.com/bluesky-social/jetstream

## Architecture

```mermaid
graph TB
    subgraph "Bluesky Network"
        ATProto[AT Protocol Network]
        Jetstream1[jetstream1.us-east.bsky.network]
        Jetstream2[jetstream2.us-east.bsky.network]
        ATProto --> Jetstream1
        ATProto --> Jetstream2
    end

    subgraph "Bluesky Streams App"
        subgraph "Producer (Node.js)"
            WSClient[WebSocket Client]
            MessageProcessor[Message Processor]
            HeaderExtractor[Header Extractor]
            AMQPPublisher[AMQP Publisher]
        end
        
        subgraph "LavinMQ Server"
            Queue[(Stream Queue)]
            Management[Management API]
        end
        
        subgraph "HTTP Server (Node.js)"
            HTTPServer[HTTP Server :8000]
            TemplateEngine[Template Engine]
        end
        
        subgraph "Consumers"
            WebConsumer[Web Consumer<br/>Real-time Viewer]
            CLIConsumer[CLI Consumer<br/>Batch Processing]
        end
    end
    
    %% Data Flow
    Jetstream1 -.->|WebSocket<br/>wss://| WSClient
    Jetstream2 -.->|WebSocket<br/>wss://| WSClient
    
    WSClient --> MessageProcessor
    MessageProcessor --> HeaderExtractor
    HeaderExtractor --> AMQPPublisher
    AMQPPublisher -->|AMQP Publish| Queue
    
    HTTPServer --> TemplateEngine
    TemplateEngine --> WebConsumer
    
    Queue -->|AMQP WebSocket| WebConsumer
    Queue -->|AMQP| CLIConsumer
    Management -.->|HTTP API| WebConsumer
    
    %% Styling
    classDef external fill:#e1f5fe
    classDef producer fill:#f3e5f5
    classDef storage fill:#fff3e0
    classDef consumer fill:#e8f5e8
    classDef server fill:#fce4ec
    
    class ATProto,Jetstream1,Jetstream2 external
    class WSClient,MessageProcessor,HeaderExtractor,AMQPPublisher producer
    class Queue,Management storage
    class WebConsumer,CLIConsumer consumer
    class HTTPServer,TemplateEngine server
```

### Message Flow

```mermaid
sequenceDiagram
    participant BS as Bluesky Network
    participant JS as Jetstream
    participant WS as WebSocket Client
    participant MP as Message Processor
    participant HE as Header Extractor
    participant AP as AMQP Publisher
    participant LQ as LavinMQ Queue
    participant WC as Web Consumer
    participant CC as CLI Consumer

    BS->>JS: AT Protocol Events
    JS->>WS: JSON Messages via WebSocket
    WS->>MP: Raw Message Data
    MP->>HE: Parsed JSON
    
    Note over HE: Extracts metadata:<br/>• bs.type (post/like/follow)<br/>• bs.lang (language)<br/>• bs.date (YYYY-MM-DD)<br/>• bs.operation (create/update/delete)
    
    HE->>AP: Message + Headers
    AP->>LQ: AMQP Publish with Headers
    
    par Web Consumer
        LQ->>WC: AMQP WebSocket Subscribe
        WC->>WC: Apply Delay (if configured)
        WC->>WC: Display in Browser UI
    and CLI Consumer  
        LQ->>CC: AMQP Subscribe
        CC->>CC: Process & Output
    end
```

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

### Web-based Stream Viewer

Start a local web server to view the Bluesky stream in your browser:

```bash
npm run serve
# or
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

**Web Viewer Features:**
- 🔴 **Live streaming** with real-time message display
- 🎯 **Advanced filtering** by message type (posts, likes, reposts, follows) and language (45+ supported)
- 📊 **Live statistics** showing message rates, type breakdown, and top languages
- ⚡ **WebSocket connection** directly to LavinMQ for minimal latency
- 🎨 **Responsive UI** with clean, modern design
- 📱 **Mobile-friendly** interface

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

#### Filtered consumption
```bash
node consumer.js --lang en                # Only English messages
node consumer.js --posts-only             # Only text posts (no likes, reposts, etc.)
node consumer.js 50 --lang ja             # Get 50 Japanese messages
node consumer.js --lang en --posts-only   # English text posts only
node consumer.js --lang es > spanish.json # Spanish messages to file
```

**Consumer Options:**
- `--lang <language>`: Filter by language code (e.g., en, ja, es, fr)
- `--posts-only`: Only consume text posts (excludes likes, reposts, follows, etc.)
- `--help`: Show usage help

## Features

- Connects to Bluesky Jetstream WebSocket feed
- Publishes all messages to LavinMQ stream queue with rich headers
- Automatic reconnection with exponential backoff
- Graceful shutdown handling
- Message filtering via headers for language, type, date, and action
- Minimal dependencies (ws, amqp-client.js)

## Message Headers

The producer automatically adds headers to each message for filtering:

**Basic Headers:**
- `bs.kind` - Message type (commit, handle, migrate, tombstone, info)
- `bs.operation` - Operation type (create, update, delete)
- `bs.type` - Content type (post, like, repost, follow, profile, etc.)
- `bs.date` - Date in YYYY-MM-DD format

**Identifier Headers:**
- `bs.did` - Actor DID
- `bs.rkey` - Record key  
- `bs.cid` - Content hash

**Content Headers (for posts):**
- `bs.lang` - Language code (e.g., "en", "ja")
- `bs.text_chars` - Text length
- `bs.has_media` - true/false for embedded media

**Timestamp Headers:**
- `bs.time_us` - Jetstream timestamp (microseconds)
- `bs.created_at` - Author timestamp (ISO-8601)
- `bs.record_date` - Record date in YYYY-MM-DD format

## Dependencies

- `ws`: WebSocket client for connecting to Bluesky Jetstream
- `amqp-client.js`: AMQP client for LavinMQ integration
