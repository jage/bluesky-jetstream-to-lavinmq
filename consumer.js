const { AMQPClient } = require("@cloudamqp/amqp-client");

class StreamConsumer {
  constructor(options = {}) {
    this.amqpClient = null;
    this.amqpChannel = null;
    this.consumer = null;
    this.messageLimit = options.messageLimit || null;
    this.messageCount = 0;
    this.messages = [];
  }

  async connect() {
    try {
      const amqpUrl = process.env.AMQP_URL || "amqp://localhost:5672";
      console.log("Connecting to AMQP...");

      this.amqpClient = new AMQPClient(amqpUrl);
      await this.amqpClient.connect();
      this.amqpChannel = await this.amqpClient.channel();

      console.log("Connected to LavinMQ");
    } catch (error) {
      console.error("AMQP connection failed:", error);
      throw error;
    }
  }

  async consume() {
    const streamName = process.env.STREAM_NAME || "bluesky-stream";

    try {
      // Declare queue to ensure it exists
      const queue = await this.amqpChannel.queue(
        streamName,
        { durable: true },
        { "x-queue-type": "stream" },
      );

      return new Promise(async (resolve, reject) => {
        let timeoutId = null;
        let completed = false;

        const cleanup = async (success = false) => {
          if (completed) return;
          completed = true;

          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          try {
            if (this.consumer) await this.consumer.cancel();
          } catch (e) {
            // Ignore cancel errors
          }

          if (success && this.messageLimit) {
            this.outputResults();
          }

          resolve();
        };

        // Use queue.subscribe for stream consumption with proper error handling
        const consumer = await queue.subscribe({ noAck: false }, async (msg) => {
          try {
            if (this.messageLimit && this.messageCount >= this.messageLimit) {
              return;
            }

            if (msg && msg.properties.contentType === "application/json") {
              const jsonData = JSON.parse(msg.bodyToString());
              
              if (this.messageLimit) {
                this.messages.push(jsonData);
                this.messageCount++;
                
                if (this.messageCount >= this.messageLimit) {
                  await msg.ack();
                  await cleanup(true);
                  return;
                }
              } else {
                console.log(JSON.stringify(jsonData, null, 2));
                console.log("---");
              }
            }
            // Acknowledge the message to prevent redelivery
            await msg.ack();
          } catch (error) {
            console.error("Error processing message:", error);
            // Reject the message and don't requeue it
            await msg.nack(false);
          }
        });

        if (this.messageLimit) {
          console.log(`Fetching ${this.messageLimit} messages from stream: ${streamName}`);
          
          // Timeout after 10 seconds
          timeoutId = setTimeout(async () => {
            await cleanup(false);
            reject(new Error(`Timeout: Only received ${this.messageCount}/${this.messageLimit} messages`));
          }, 10000);
        } else {
          console.log(`Consuming messages from stream: ${streamName}`);
          console.log("Press Ctrl+C to exit\n");
        }

        // Store consumer reference for cleanup
        this.consumer = consumer;
      });
    } catch (error) {
      console.error("Failed to consume messages:", error);
      throw error;
    }
  }

  outputResults() {
    console.log(JSON.stringify(this.messages));
  }

  async close() {
    try {
      // Cancel consumer first if it exists
      if (this.consumer) {
        await this.consumer.cancel();
        this.consumer = null;
      }

      // Close channel
      if (this.amqpChannel) {
        await this.amqpChannel.close();
        this.amqpChannel = null;
      }

      // Close connection
      if (this.amqpClient) {
        await this.amqpClient.close();
        this.amqpClient = null;
      }
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }
}

function printUsage() {
  console.log(`
Usage: node consumer.js [number_of_messages]

Arguments:
  number_of_messages    Number of messages to retrieve (optional, defaults to unlimited)

Options:
  --help               Show this help message

Examples:
  node consumer.js                          # Consume messages indefinitely
  node consumer.js 10                       # Get 10 messages as JSON array
  node consumer.js 100 > samples.json       # Get 100 messages and save to file
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  let messageLimit = null;

  // Parse first argument as message count if it's a number
  if (args.length > 0 && !isNaN(parseInt(args[0])) && parseInt(args[0]) > 0) {
    messageLimit = parseInt(args[0]);
  }

  const consumer = new StreamConsumer({
    messageLimit
  });

  // Only set up signal handlers for unlimited consumption
  if (!messageLimit) {
    process.on("SIGINT", async () => {
      console.log("\nShutting down consumer...");
      await consumer.close();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nShutting down consumer...");
      await consumer.close();
      process.exit(0);
    });
  }

  try {
    await consumer.connect();
    await consumer.consume();
    
    if (messageLimit) {
      await consumer.close();
    }
  } catch (error) {
    console.error("Consumer failed:", error);
    await consumer.close();
    process.exit(1);
  }
}

main().catch(console.error);
