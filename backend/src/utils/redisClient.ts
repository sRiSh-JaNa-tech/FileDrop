import { createClient } from "redis";

export const client = createClient({
    url: "redis://default:NHiBlvdMwHcrw15ETdpzLQlQPlQ2Fx1k@redis-15748.c309.us-east-2-1.ec2.cloud.redislabs.com:15748"
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