type Bucket = {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillPerMs: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  capacity: number;
  refillPerSecond: number;
};

export async function acquireToken(key: string, options: RateLimitOptions): Promise<void> {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      tokens: options.capacity,
      lastRefill: Date.now(),
      capacity: options.capacity,
      refillPerMs: options.refillPerSecond / 1000,
    };
    buckets.set(key, bucket);
  }

  while (true) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
      bucket.lastRefill = now;
    }
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }
    const waitMs = Math.ceil((1 - bucket.tokens) / bucket.refillPerMs);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
