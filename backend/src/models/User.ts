import { RedisClientType } from "redis";
import { createClient } from 'redis';

export async function createUser(
    client: RedisClientType,
    userId: string,
    name: string,
    peerId: string
) {
    const normalizedName = name.toLowerCase();

    const multi = client.multi();

    multi.hSet(`user:${userId}`, {
        name,
        peerId
    });

    multi.set(`peer:${peerId}`, userId);
    multi.set(`username:${normalizedName}`, userId);

    await multi.exec();
}

export async function findUserByName(
    client: RedisClientType,
    userName: string
) {
    const normalizedName = userName.toLowerCase();

    const userId = await client.get(`username:${normalizedName}`);
    if (!userId) return null;

    const user = await client.hGetAll(`user:${userId}`);

    if (Object.keys(user).length === 0) return null;

    return {
        userId,
        name: user.name,
        peerId: user.peerId
    };
}

export async function getPeerForConnection(
    client: RedisClientType,
    targetUserName: string
) {
    try {
        const normalizedName = targetUserName.toLowerCase();

        const userId = await client.get(`username:${normalizedName}`);

        if (!userId) {
            return { success: false, error: "User not found" };
        }

        const user = await client.hGetAll(`user:${userId}`);

        if (Object.keys(user).length === 0) {
            return { success: false, error: "User data missing" };
        }

        return {
            success: true,
            data: {
                userId,
                peerId: user.peerId,
                name: user.name
            }
        };
    } catch (err) {
        console.error("Redis error:", err);
        return { success: false, error: "Internal server error" };
    }
}

