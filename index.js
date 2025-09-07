const WebSocket = require("ws");
const { AMQPClient } = require("@cloudamqp/amqp-client");

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
    await this.amqpChannel.basicPublish("", streamName, data, {
      persistent: true,
      contentType: "application/json",
    });
    this.messageCount++;
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

async function main() {
  const streamer = new BlueSkyStreamer();

  process.on("SIGINT", async () => {
    console.log("Shutting down gracefully...");
    await streamer.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("Shutting down gracefully...");
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
