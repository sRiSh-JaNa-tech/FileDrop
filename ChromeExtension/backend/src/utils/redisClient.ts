import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    throw new Error("REDIS_URL is not defined in the environment variables");
}

export const client = createClient({
    url: redisUrl,
    socket: {
        keepAlive: true,
        connectTimeout: 10000,
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.log("Too many retries, stopping");
                return new Error("Retry limit reached");
            }
            return Math.min(retries * 100, 3000);
        }
    }
});
client.on("error", (err) => {
    console.log("Redis Error:", err);
});
client.on("connect", () => console.log("Connected to Redis"));
client.on("ready", () => console.log("Redis ready"));
client.on("reconnecting", () => console.log("Reconnecting..."));
client.on("end", () => console.log("Redis disconnected")); 

export async function connectToRedis() {
    if (!client.isOpen) {
        await client.connect();
        console.log("Redis connected");
    }
}