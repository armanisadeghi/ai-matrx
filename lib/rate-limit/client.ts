import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Lazy-initialized Redis client
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set");
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

/**
 * Rate limiters for different API surfaces.
 *
 * Uses sliding window algorithm — each identifier gets a rolling window,
 * not a fixed hourly bucket. This is more resilient to burst traffic.
 */

// Public email endpoint: 5 emails per IP per hour
export function getPublicEmailRatelimiter() {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    prefix: "rl:public_email",
    analytics: true,
  });
}

// Auth endpoints (login, register, reset): 10 per IP per 15 minutes
export function getAuthRatelimiter() {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    prefix: "rl:auth",
    analytics: true,
  });
}

// Contact form: 3 submissions per IP per hour
export function getContactRatelimiter() {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(3, "1 h"),
    prefix: "rl:contact",
    analytics: true,
  });
}

// AI model API routes (authenticated): 60 per user per minute
export function getAiRatelimiter() {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "rl:ai",
    analytics: true,
  });
}

// General API rate limit (authenticated): 200 per user per minute
export function getApiRatelimiter() {
  return new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(200, "1 m"),
    prefix: "rl:api",
    analytics: true,
  });
}
