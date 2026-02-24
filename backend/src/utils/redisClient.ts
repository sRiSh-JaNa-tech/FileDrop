import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

export const client = createClient({
    url: process.env.REDIS_URL
});

client.on("error", (err) => {
    console.log("Redis Error:", err);
});

export async function connectToRedis() {
    if (!client.isOpen) {
        await client.connect();
        console.log("Redis connected");
    }
}