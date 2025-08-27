const { AMQPClient } = require('@cloudamqp/amqp-client');

class StreamConsumer {
  constructor() {
    this.amqpClient = null;
    this.amqpChannel = null;
  }

  async connect() {
    try {
      const amqpUrl = process.env.AMQP_URL || 'amqp://localhost:5672';
      console.log('Connecting to AMQP...');
      
      this.amqpClient = new AMQPClient(amqpUrl);
      await this.amqpClient.connect();
      this.amqpChannel = await this.amqpClient.channel();
      
      console.log('Connected to LavinMQ');
    } catch (error) {
      console.error('AMQP connection failed:', error);
      throw error;
    }
  }

  async consume() {
    const streamName = process.env.STREAM_NAME || 'bluesky-stream';
    
    try {
      // Declare queue to ensure it exists
      const queue = await this.amqpChannel.queue(streamName, { durable: true }, { "x-queue-type": "stream" });
      
      // Use queue.subscribe for stream consumption
      await queue.subscribe({ noAck: false }, async (msg) => {
        if (msg && msg.properties.contentType === 'application/json') {
          const jsonData = JSON.parse(msg.bodyToString());
          console.log(JSON.stringify(jsonData, null, 2));
          console.log('---');
        }
      });
      
      console.log(`Consuming messages from stream: ${streamName}`);
      console.log('Press Ctrl+C to exit\n');
      
    } catch (error) {
      console.error('Failed to consume messages:', error);
    }
  }

  async close() {
    if (this.amqpClient) {
      try {
        await this.amqpClient.close();
      } catch (error) {
        // Ignore connection already closed errors
      }
    }
  }
}

async function main() {
  const consumer = new StreamConsumer();
  
  process.on('SIGINT', async () => {
    console.log('\nShutting down consumer...');
    await consumer.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down consumer...');
    await consumer.close();
    process.exit(0);
  });

  try {
    await consumer.connect();
    await consumer.consume();
  } catch (error) {
    console.error('Consumer failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);