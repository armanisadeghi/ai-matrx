/**
 * Centralized Fingerprint Service
 *
 * Handles robust guest identification for all non-authenticated routes.
 * Uses FingerprintJS for reliable, cross-session identification.
 *
 * CRITICAL: This service MUST be used for ANY AI interaction from guests.
 */

import FingerprintJS, { type Agent, type BuiltinComponents } from "@fingerprintjs/fingerprintjs";

let fpPromise: Promise<Agent> | null = null;
let cachedFingerprint: string | null = null;

// Storage configuration
const STORAGE_KEY = "ai_matrx_guest_fp";
const STORAGE_VERSION = "1";

interface FingerprintData {
  fingerprint: string;
  version: string;
  createdAt: number;
  lastUsed: number;
}

/**
 * Initialize FingerprintJS
 */
function initFingerprint() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

/**
 * Get visitor fingerprint
 *
 * @returns Unique visitor ID that persists across sessions
 */
export async function getFingerprint(): Promise<string> {
  // Layer 1: Return memory cache if available
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  // Layer 2: Try to load from localStorage with version validation
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: FingerprintData = JSON.parse(stored);

        // Validate version and fingerprint existence
        if (data.version === STORAGE_VERSION && data.fingerprint) {
          cachedFingerprint = data.fingerprint;

          // Update lastUsed timestamp
          data.lastUsed = Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

          console.log("✅ Loaded cached fingerprint from localStorage");
          return data.fingerprint;
        }
      }
    } catch (error) {
      console.warn(
        "⚠️ Failed to parse cached fingerprint, regenerating:",
        error,
      );
    }
  }

  // Layer 3: Generate new fingerprint
  try {
    const fp = await initFingerprint();
    const result = await fp.get();

    // Use visitor ID as primary fingerprint
    const fingerprint = result.visitorId;
    cachedFingerprint = fingerprint;

    // Store in localStorage with metadata for persistence
    if (typeof window !== "undefined") {
      const fpData: FingerprintData = {
        fingerprint,
        version: STORAGE_VERSION,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fpData));
      console.log("✅ Generated and stored new fingerprint in localStorage");
    }

    return fingerprint;
  } catch (error) {
    console.error("❌ Fingerprint generation failed:", error);

    // Fallback: Try to get from localStorage (even if version mismatch)
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          if (data.fingerprint) {
            cachedFingerprint = data.fingerprint;
            console.warn("⚠️ Using old version fingerprint as fallback");
            return data.fingerprint;
          }
        }
      } catch (parseError) {
        console.error("Failed to parse fallback fingerprint:", parseError);
      }
    }

    // Last resort: Generate temporary ID (will be different per session)
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.warn("⚠️ Using temporary fingerprint:", tempId);
    return tempId;
  }
}

/**
 * Get or retrieve cached fingerprint synchronously
 * Use only after calling getFingerprint() at least once
 */
export function getCachedFingerprint(): string | null {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  // Try localStorage with version validation
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: FingerprintData = JSON.parse(stored);
        if (data.version === STORAGE_VERSION && data.fingerprint) {
          cachedFingerprint = data.fingerprint;

          // Update lastUsed timestamp
          data.lastUsed = Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

          return data.fingerprint;
        }
      }
    } catch (error) {
      console.error("Failed to parse cached fingerprint:", error);
    }
  }

  return null;
}

/**
 * Clear cached fingerprint (for testing)
 */
export function clearCachedFingerprint(): void {
  cachedFingerprint = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Get detailed visitor information
 * Use for debugging or advanced tracking
 */
export async function getDetailedFingerprint(): Promise<{
  visitorId: string;
  confidence: number;
  components: BuiltinComponents;
}> {
  try {
    const fp = await initFingerprint();
    const result = await fp.get();

    return {
      visitorId: result.visitorId,
      confidence: result.confidence.score,
      components: result.components,
    };
  } catch (error) {
    console.error("Failed to get detailed fingerprint:", error);
    throw error;
  }
}

/**
 * Validate that a fingerprint string looks legitimate
 * Helps prevent bypassing via fake fingerprints
 */
export function isValidFingerprint(fingerprint: string): boolean {
  if (!fingerprint || typeof fingerprint !== "string") {
    return false;
  }

  // FingerprintJS visitor IDs are typically alphanumeric, 20+ chars
  if (fingerprint.length < 16) {
    return false;
  }

  // Check if it's a temp ID (our fallback)
  if (fingerprint.startsWith("temp_")) {
    return true; // Allow temps but flag them
  }

  // Should be alphanumeric
  return /^[a-zA-Z0-9]+$/.test(fingerprint);
}

/**
 * Check if fingerprint is a temporary one (fallback)
 * These should be flagged for monitoring
 */
export function isTempFingerprint(fingerprint: string): boolean {
  return fingerprint?.startsWith("temp_") || false;
}
