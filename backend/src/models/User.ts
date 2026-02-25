import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

export async function createUser(
    client: RedisClient,
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
    return { success: true, data: { userId, name, peerId } };
}

export async function findUserByName(
    client: RedisClient,
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
    client: RedisClient,
    userName: string
) {
    try {
        const normalizedName = userName.toLowerCase();
        const userId = await client.get(`username:${normalizedName}`);

        if (!userId) {
            return { success: false, error: "User not found for this Name" };
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

export async function deleteUser(
    client: RedisClient,
    userId: string
) {
    const user = await client.hGetAll(`user:${userId}`);
    if (!user || Object.keys(user).length === 0) return;

    const name = user["name"];
    const peerId = user["peerId"];
    if (!name || !peerId) return;

    const normalizedName = name.toLowerCase();

    const multi = client.multi();
    multi.del(`user:${userId}`);
    multi.del(`username:${normalizedName}`);
    multi.del(`peer:${peerId}`);

    await multi.exec();
}
