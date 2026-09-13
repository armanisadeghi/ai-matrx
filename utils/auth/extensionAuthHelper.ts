/**
 * Extension Authentication Helper
 *
 * Utilities for generating and managing extension auth codes.
 * Can be used in both client and server contexts.
 */

export interface ExtensionAuthCode {
  code: string;
  expiresAt: string;
  expiresIn: number;
}

export interface ExtensionAuthSession {
  success: boolean;
  user: {
    id: string;
    email: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
}

/**
 * Generate an extension auth code (client-side)
 */
export async function generateExtensionAuthCode(): Promise<ExtensionAuthCode> {
  const response = await fetch("/api/auth/extension/generate-code", {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate code");
  }

  return response.json();
}

/**
 * Exchange a code for a session (typically used by extension)
 */
export async function exchangeExtensionAuthCode(
  code: string,
  apiBase: string = "",
): Promise<ExtensionAuthSession> {
  const response = await fetch(`${apiBase}/auth/extension/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to exchange code");
  }

  return response.json();
}

/**
 * Format a code for display (adds spaces every 4 characters)
 */
export function formatAuthCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(" ") || code;
}

/**
 * Validate code format
 */
export function isValidAuthCode(code: string): boolean {
  // Remove spaces and check if it's a valid 32-character hex string
  const cleaned = code.replace(/\s/g, "").toUpperCase();
  return /^[A-F0-9]{32}$/.test(cleaned);
}

/**
 * Clean a code (remove spaces, uppercase)
 */
export function cleanAuthCode(code: string): string {
  return code.replace(/\s/g, "").toUpperCase();
}

/**
 * Calculate time remaining until expiration
 */
export function getTimeRemaining(expiresAt: string): {
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diffMs = expires.getTime() - now.getTime();

  if (diffMs <= 0) {
    return { minutes: 0, seconds: 0, expired: true };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return { minutes, seconds, expired: false };
}
