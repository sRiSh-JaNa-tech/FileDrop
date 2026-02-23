import { createClient } from "redis";

export const client = createClient();

client.on("error", (err) => {
    console.log("Redis Error:", err);
});

export async function connectRedis() {
    if (!client.isOpen) {
        await client.connect();
        console.log("Redis connected");
    }
}