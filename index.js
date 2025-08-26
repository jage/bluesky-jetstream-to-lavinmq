const WebSocket = require('ws');
const { AMQPClient } = require('@cloudamqp/amqp-client');

class BlueSkyStreamer {
  constructor() {
    this.ws = null;
    this.amqpClient = null;
    this.amqpChannel = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  async init() {
    await this.connectAMQP();
    this.connectWebSocket();
  }

  async connectAMQP() {
    try {
      const amqpUrl = process.env.AMQP_URL || 'amqp://localhost:5672';
      console.log('Connecting to AMQP...');
      
      this.amqpClient = new AMQPClient(amqpUrl);
      await this.amqpClient.connect();
      this.amqpChannel = await this.amqpClient.channel();
      
      const streamName = process.env.STREAM_NAME || 'bluesky-stream';
      await this.amqpChannel.queueDeclare(streamName, { durable: true }, { "x-queue-type": "stream" });
      
      console.log('AMQP connected successfully');
    } catch (error) {
      console.error('AMQP connection failed:', error);
      throw error;
    }
  }

  connectWebSocket() {
    try {
      console.log('Connecting to Bluesky Jetstream...');
      this.ws = new WebSocket('wss://jetstream2.us-east.bsky.network/subscribe');

      this.ws.on('open', () => {
        console.log('WebSocket connected to Bluesky Jetstream');
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', async (data) => {
        try {
          await this.publishMessage(data);
        } catch (error) {
          console.error('Failed to publish message:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} ${reason}`);
        this.handleReconnect();
      });

    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.handleReconnect();
    }
  }

  async publishMessage(data) {
    if (!this.amqpChannel) {
      throw new Error('AMQP channel not available');
    }

    const streamName = process.env.STREAM_NAME || 'bluesky-stream';
    await this.amqpChannel.basicPublish('', streamName, data, { 
      persistent: true,
      contentType: 'application/json'
    });
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectDelay);
      
      this.reconnectDelay *= 2;
    } else {
      console.error('Max reconnect attempts reached. Exiting.');
      process.exit(1);
    }
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
  
  process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await streamer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await streamer.close();
    process.exit(0);
  });

  try {
    await streamer.init();
    console.log('Bluesky Streamer started successfully');
  } catch (error) {
    console.error('Failed to start Bluesky Streamer:', error);
    process.exit(1);
  }
}

main().catch(console.error);