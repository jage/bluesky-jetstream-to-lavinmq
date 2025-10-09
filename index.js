const WebSocket = require("ws");
const { AMQPClient } = require("@cloudamqp/amqp-client");
const http = require("http");
const fs = require("fs");
const path = require("path");

class BlueSkyStreamer {
  constructor() {
    this.ws = null;
    this.amqpClient = null;
    this.amqpChannel = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1000;
    this.maxReconnectDelay = 30000; // Max 30 seconds
    this.messageCount = 0;
    this.lastReportTime = Date.now();
    this.jetStreamServers = [
      "jetstream1.us-east.bsky.network",
      "jetstream2.us-east.bsky.network",
    ];
    this.currentServerIndex = 0;
  }

  async init() {
    await this.connectAMQP();
    this.connectWebSocket();
    this.startThroughputReporting();
  }

  async connectAMQP() {
    try {
      const amqpUrl = process.env.AMQP_URL || "amqp://localhost:5672";
      console.log("Connecting to AMQP...");

      this.amqpClient = new AMQPClient(amqpUrl);
      await this.amqpClient.connect();
      this.amqpChannel = await this.amqpClient.channel();

      const streamName = process.env.STREAM_NAME || "bluesky-stream";
      await this.amqpChannel.queueDeclare(
        streamName,
        { durable: true },
        { "x-queue-type": "stream" },
      );

      console.log("AMQP connected successfully");
    } catch (error) {
      console.error("AMQP connection failed:", error);
      throw error;
    }
  }

  connectWebSocket() {
    try {
      const server = this.jetStreamServers[this.currentServerIndex];
      console.log(`Connecting to Bluesky Jetstream: ${server}`);
      this.ws = new WebSocket(`wss://${server}/subscribe`);

      this.ws.on("open", () => {
        console.log("WebSocket connected to Bluesky Jetstream");
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      });

      this.ws.on("message", async (data) => {
        try {
          await this.publishMessage(data);
        } catch (error) {
          console.error("Failed to publish message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log(
          `WebSocket closed: ${code}, ${reason ? reason.toString() : "no reason"}, reconnect in ${this.getReconnectDelay()}ms`,
        );
        this.handleReconnect();
      });
    } catch (error) {
      console.error("WebSocket connection failed:", error);
      this.handleReconnect();
    }
  }

  async publishMessage(data) {
    if (!this.amqpChannel) {
      throw new Error("AMQP channel not available");
    }

    const streamName = process.env.STREAM_NAME || "bluesky-stream";
    const headers = this.extractHeaders(data);
    
    await this.amqpChannel.basicPublish("", streamName, data, {
      persistent: true,
      contentType: "application/json",
      headers: headers,
    });
    this.messageCount++;
  }

  extractHeaders(data) {
    try {
      const message = JSON.parse(data.toString());
      const headers = {};

      // Basic message kind
      headers['bs.kind'] = message.kind || '';

      if (message.kind === 'commit' && message.commit) {
        const commit = message.commit;

        // Operation and collection
        headers['bs.operation'] = commit.operation || '';
        headers['bs.collection'] = commit.collection || '';

        // Extract type from collection
        if (commit.collection) {
          headers['bs.type'] = this.extractTypeFromCollection(commit.collection);
        }

        // DID and other identifiers
        headers['bs.did'] = message.did || '';
        headers['bs.rkey'] = commit.rkey || '';
        headers['bs.cid'] = commit.cid || '';

        // Timestamp info
        if (message.time_us) {
          headers['bs.time_us'] = message.time_us.toString();
          // Convert to YYYY-MM-DD format
          const date = new Date(message.time_us / 1000);
          headers['bs.date'] = date.toISOString().split('T')[0];
        }

        // Record-specific headers (only for create/update operations)
        if (commit.record && commit.operation !== 'delete') {
          const record = commit.record;

          // Language (for posts)
          if (record.langs && record.langs.length > 0) {
            headers['bs.lang'] = record.langs[0];
          }

          // Created at timestamp
          if (record.createdAt) {
            headers['bs.created_at'] = record.createdAt;
            // Additional date from record timestamp
            const recordDate = new Date(record.createdAt);
            headers['bs.record_date'] = recordDate.toISOString().split('T')[0];
          }

          // Text length (for posts)
          if (record.text) {
            headers['bs.text_chars'] = record.text.length.toString();
          }

          // Media detection
          if (record.embed && record.embed.$type && record.embed.$type.startsWith('app.bsky.embed')) {
            headers['bs.has_media'] = 'true';
          } else {
            headers['bs.has_media'] = 'false';
          }
        }
      }

      return headers;
    } catch (error) {
      console.error('Failed to extract headers:', error);
      return {};
    }
  }

  extractTypeFromCollection(collection) {
    if (!collection) return 'other';
    
    const mapping = {
      'app.bsky.feed.post': 'post',
      'app.bsky.feed.like': 'like',
      'app.bsky.feed.repost': 'repost',
      'app.bsky.graph.follow': 'follow',
      'app.bsky.graph.list': 'list',
      'app.bsky.actor.profile': 'profile',
      'app.bsky.graph.listitem': 'listitem',
      'app.bsky.graph.block': 'block'
    };

    return mapping[collection] || 'other';
  }

  getReconnectDelay() {
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay,
    );
    return delay;
  }

  handleReconnect() {
    this.reconnectAttempts++;
    this.currentServerIndex =
      (this.currentServerIndex + 1) % this.jetStreamServers.length;
    const delay = this.getReconnectDelay();

    console.log(
      `Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} to ${this.jetStreamServers[this.currentServerIndex]} in ${delay}ms`,
    );

    setTimeout(() => {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        // Reset attempts after max attempts and use max delay
        console.log(
          "Resetting reconnect attempts, continuing with max delay...",
        );
        this.reconnectAttempts = this.maxReconnectAttempts - 1;
      }
      this.connectWebSocket();
    }, delay);
  }

  startThroughputReporting() {
    setInterval(() => {
      const now = Date.now();
      const elapsed = (now - this.lastReportTime) / 1000;
      const rate = (this.messageCount / elapsed).toFixed(2);
      console.log(`Published ${this.messageCount} messages (${rate} msg/sec)`);
      this.messageCount = 0;
      this.lastReportTime = now;
    }, 5000);
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
    if (this.amqpClient) {
      await this.amqpClient.close();
    }
  }
}

function startHttpServer() {
  const port = process.env.HTTP_PORT || 8000;
  const server = http.createServer((req, res) => {
    let filePath = req.url === "/" ? "/index.html" : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
    };
    const contentType = contentTypes[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === "ENOENT") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("404 Not Found");
        } else {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("500 Internal Server Error");
        }
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
      }
    });
  });

  server.listen(port, () => {
    console.log(`HTTP server listening on http://localhost:${port}`);
  });

  return server;
}

async function main() {
  const streamer = new BlueSkyStreamer();
  const httpServer = startHttpServer();

  process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    httpServer.close();
    await streamer.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down gracefully...");
    httpServer.close();
    await streamer.close();
    process.exit(0);
  });

  try {
    await streamer.init();
    console.log("Bluesky Streamer started successfully");
  } catch (error) {
    console.error("Failed to start Bluesky Streamer:", error);
    process.exit(1);
  }
}

main().catch(console.error);
