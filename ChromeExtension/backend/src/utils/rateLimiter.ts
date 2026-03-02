import { Request, Response, NextFunction } from "express";

type Bucket = {
    tokens: number;
    lastRefill: number;
};

type RateLimiterOptions = {
    capacity?: number;
    refillRate?: number;
    cleanupInterval?: number;
    idleTimeout?: number;
};

export default function createRateLimiter(options: RateLimiterOptions = {}) {
    const {
        capacity = 20,
        refillRate = 5,
        cleanupInterval = 60000,
        idleTimeout = 120
    } = options;

    const buckets: Map<string, Bucket> = new Map();

    function getIP(req: Request): string {
        return req.ip || "unknown";
    }

    // 🧹 Cleanup job
    setInterval(() => {
        const now = Date.now() / 1000;

        for (const [ip, bucket] of buckets.entries()) {
            if (now - bucket.lastRefill > idleTimeout) {
                buckets.delete(ip);
            }
        }
    }, cleanupInterval);

    return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
        const ip = getIP(req);
        const now = Date.now() / 1000;

        let bucket = buckets.get(ip);

        if (!bucket) {
            bucket = { tokens: capacity, lastRefill: now };
            buckets.set(ip, bucket);
        }

        // refill
        const elapsed = now - bucket.lastRefill;
        bucket.tokens = Math.min(
            capacity,
            bucket.tokens + elapsed * refillRate
        );
        bucket.lastRefill = now;

        // limit check
        if (bucket.tokens < 1) {
            const waitTime = ((1 - bucket.tokens) / refillRate).toFixed(2);

            res.setHeader("Retry-After", waitTime);
            res.status(429).json({
                error: "Too many requests",
                retryAfter: `${waitTime} seconds`
            });
            return;
        }

        // consume
        bucket.tokens -= 1;

        next();
    };
}