/**
 * Broker Resolution Service
 * 
 * Resolves broker values for given context using the hierarchical database function.
 * Follows the priority hierarchy:
 * AI Task > AI Run > Task > Project > Org > User > Global
 */

import { supabase } from '@/utils/supabase/client';
import type {
  BrokerResolutionContext,
  BrokerResolutionResult,
  ResolvedBrokerValue,
  BrokerResolutionOptions,
} from '../types/resolution';

/**
 * Resolves broker values for given context
 * 
 * @param brokerIds - Array of broker UUIDs to resolve
 * @param context - Context information for resolution
 * @param options - Optional configuration
 * @returns Promise with resolved values and metadata
 * 
 * @example
 * ```typescript
 * const result = await resolveBrokersForContext(
 *   ['broker-uuid-1', 'broker-uuid-2'],
 *   {
 *     userId: 'user-uuid',
 *     projectId: 'project-uuid'
 *   }
 * );
 * 
 * console.log(result.values['broker-uuid-1']); // Resolved value
 * console.log(result.metadata.scopeLevels['broker-uuid-1']); // 'project'
 * ```
 */
export async function resolveBrokersForContext(
  brokerIds: string[],
  context: BrokerResolutionContext,
  options: BrokerResolutionOptions = {}
): Promise<BrokerResolutionResult> {
  const {
    throwOnMissing = false,
    includeDebugInfo = false,
  } = options;

  // Empty brokerIds - return empty result
  if (!brokerIds || brokerIds.length === 0) {
    return {
      values: {},
      metadata: {
        resolvedAt: new Date().toISOString(),
        context,
        scopeLevels: {},
      },
    };
  }

  try {
    // Call the database function
    const { data, error } = await supabase.rpc('get_broker_values_for_context', {
      p_broker_ids: brokerIds,
      p_user_id: context.userId ?? undefined,
      p_organization_id: context.organizationId ?? undefined,
      p_project_id: context.projectId ?? undefined,
      p_task_id: context.taskId ?? undefined,
      p_ai_run_id: context.aiRunId || null,
      p_ai_task_id: context.aiTaskId || null,
    });

    if (error) {
      console.error('❌ Broker resolution failed:', error);
      throw new Error(`Broker resolution failed: ${error.message}`);
    }

    // Transform result
    const values: Record<string, any> = {};
    const scopeLevels: Record<string, string> = {};

    const resolvedValues = (data as unknown as ResolvedBrokerValue[]) ?? [];

    resolvedValues.forEach((item) => {
      // Extract the actual value from JSONB
      values[item.brokerId] = item.value;
      scopeLevels[item.brokerId] = item.scopeLevel;
    });

    // Check for missing brokers if requested
    if (throwOnMissing) {
      const resolvedIds = new Set(Object.keys(values));
      const missingIds = brokerIds.filter((id) => !resolvedIds.has(id));

      if (missingIds.length > 0) {
        throw new Error(
          `Missing broker values for: ${missingIds.join(', ')}`
        );
      }
    }

    // Build result
    const result: BrokerResolutionResult = {
      values,
      metadata: {
        resolvedAt: new Date().toISOString(),
        context,
        scopeLevels,
      },
    };

    // Add debug info if requested
    if (includeDebugInfo) {
      console.log('🔍 Broker Resolution Debug:', {
        requestedCount: brokerIds.length,
        resolvedCount: Object.keys(values).length,
        missingCount: brokerIds.length - Object.keys(values).length,
        scopeLevels,
        context,
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Broker resolution error:', error);
    throw error;
  }
}

/**
 * Get broker IDs that have no value in the given context
 * 
 * @param brokerIds - Array of broker UUIDs to check
 * @param context - Context information
 * @returns Promise with array of missing broker IDs
 * 
 * @example
 * ```typescript
 * const missing = await getMissingBrokerIds(
 *   ['broker-1', 'broker-2', 'broker-3'],
 *   { userId: 'user-uuid', projectId: 'project-uuid' }
 * );
 * // Returns: ['broker-2'] if broker-2 has no value
 * ```
 */
export async function getMissingBrokerIds(
  brokerIds: string[],
  context: BrokerResolutionContext
): Promise<string[]> {
  if (!brokerIds || brokerIds.length === 0) {
    return [];
  }

  try {
    const result = await resolveBrokersForContext(brokerIds, context);
    const resolvedIds = new Set(Object.keys(result.values));
    return brokerIds.filter((id) => !resolvedIds.has(id));
  } catch (error) {
    console.error('❌ Failed to get missing broker IDs:', error);
    // On error, assume all are missing (safe fallback)
    return brokerIds;
  }
}

/**
 * Check if all broker IDs have values in the given context
 * 
 * @param brokerIds - Array of broker UUIDs to check
 * @param context - Context information
 * @returns Promise with boolean indicating if all brokers are resolved
 * 
 * @example
 * ```typescript
 * const allResolved = await areBrokersFullyResolved(
 *   ['broker-1', 'broker-2'],
 *   { userId: 'user-uuid' }
 * );
 * // Returns: true if both brokers have values
 * ```
 */
export async function areBrokersFullyResolved(
  brokerIds: string[],
  context: BrokerResolutionContext
): Promise<boolean> {
  const missing = await getMissingBrokerIds(brokerIds, context);
  return missing.length === 0;
}

/**
 * Resolve a single broker value
 * 
 * @param brokerId - Broker UUID
 * @param context - Context information
 * @returns Promise with resolved value or null if not found
 * 
 * @example
 * ```typescript
 * const value = await resolveSingleBroker(
 *   'broker-uuid',
 *   { userId: 'user-uuid', projectId: 'project-uuid' }
 * );
 * ```
 */
export async function resolveSingleBroker(
  brokerId: string,
  context: BrokerResolutionContext
): Promise<any | null> {
  const result = await resolveBrokersForContext([brokerId], context);
  return result.values[brokerId] ?? null;
}

/**
 * Batch resolve brokers with caching (useful for multiple sequential calls)
 * 
 * Note: This is a simple implementation. For production, consider using
 * a more sophisticated caching strategy with TTL.
 */
const resolutionCache = new Map<string, {
  result: BrokerResolutionResult;
  timestamp: number;
}>();

const CACHE_TTL = 60000; // 1 minute

/**
 * Resolve brokers with simple in-memory caching
 * 
 * @param brokerIds - Array of broker UUIDs
 * @param context - Context information
 * @param options - Resolution options
 * @returns Promise with cached or fresh result
 */
export async function resolveBrokersWithCache(
  brokerIds: string[],
  context: BrokerResolutionContext,
  options: BrokerResolutionOptions = {}
): Promise<BrokerResolutionResult> {
  const { maxCacheAge = CACHE_TTL } = options;

  // Create cache key from brokerIds and context
  const cacheKey = JSON.stringify({
    brokerIds: brokerIds.sort(),
    context,
  });

  // Check cache
  const cached = resolutionCache.get(cacheKey);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age < maxCacheAge) {
      console.log('✅ Using cached broker resolution');
      return cached.result;
    } else {
      resolutionCache.delete(cacheKey);
    }
  }

  // Fetch fresh
  const result = await resolveBrokersForContext(brokerIds, context, options);

  // Cache result
  resolutionCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Clear the resolution cache
 */
export function clearResolutionCache(): void {
  resolutionCache.clear();
  console.log('🧹 Broker resolution cache cleared');
}

