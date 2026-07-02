// lib/server/brokerCache.ts
import { createClient } from 'redis';
import { cookies } from 'next/headers';
import { BrokerIdentifier } from '../redux/brokerSlice/types';

class ServerBrokerCache {
  private redis: ReturnType<typeof createClient>;
  private connected: boolean = false;
  
  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    
    // Connection is handled lazily in each method
  }

  // Ensure the Redis client is connected
  private async ensureConnection() {
    if (!this.connected) {
      await this.redis.connect();
      this.connected = true;
    }
  }

  // Get broker value by identifier
  async getValue(idArgs: BrokerIdentifier, sessionId?: string) {
    const key = this.getBrokerKey(idArgs, sessionId);
    await this.ensureConnection();
    
    const result = await this.redis.get(key);
    return result ? JSON.parse(result.toString()) : null;
  }

  // Set broker value
  async setValue(idArgs: BrokerIdentifier, value: unknown, sessionId?: string) {
    const key = this.getBrokerKey(idArgs, sessionId);
    await this.ensureConnection();
    
    await this.redis.set(key, JSON.stringify(value), {
      EX: 3600 // 1 hour expiry
    });
  }

  // Get user-specific broker key
  private getBrokerKey(idArgs: BrokerIdentifier, sessionId?: string) {
    // Handle union type: BrokerIdentifier can be { brokerId } or { source, mappedItemId }
    if ('brokerId' in idArgs && idArgs.brokerId) {
      const baseKey = idArgs.brokerId;
      return sessionId ? `session:${sessionId}:${baseKey}` : `global:${baseKey}`;
    }
    if ('source' in idArgs && 'mappedItemId' in idArgs && idArgs.source && idArgs.mappedItemId) {
      const baseKey = `${idArgs.source}:${idArgs.mappedItemId}`;
      return sessionId ? `session:${sessionId}:${baseKey}` : `global:${baseKey}`;
    }
    // MATRX-EXCEPTION: fallback for compatibility — historical callers could
    // send extra untyped fields (`brokerId`/`itemId`) beyond the current
    // BrokerIdentifier shape (source/mappedItemId/sourceId); read those
    // defensively rather than assume the narrower current type is exhaustive
    // at runtime for every caller.
    const legacy = idArgs as unknown as {
      brokerId?: string;
      source?: string;
      mappedItemId?: string;
      itemId?: string;
    };
    const baseKey =
      legacy.brokerId || `${legacy.source}:${legacy.mappedItemId || legacy.itemId}`;
    return sessionId ? `session:${sessionId}:${baseKey}` : `global:${baseKey}`;
  }

  // Sync multiple brokers at once
  async syncBrokers(brokers: Array<{ idArgs: BrokerIdentifier; value: unknown }>, sessionId?: string) {
    await this.ensureConnection();
    
    const multi = this.redis.multi();
    
    brokers.forEach(({ idArgs, value }) => {
      const key = this.getBrokerKey(idArgs, sessionId);
      multi.set(key, JSON.stringify(value), {
        EX: 3600 // 1 hour expiry
      });
    });
    
    await multi.exec();
  }
  
  // Cleanup method - should be called when the server is shutting down
  async disconnect() {
    if (this.connected) {
      await this.redis.disconnect();
      this.connected = false;
    }
  }
}

export const brokerCache = new ServerBrokerCache();