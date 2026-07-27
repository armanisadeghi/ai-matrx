// lib/apple-key-config.ts

/**
 * Apple OAuth Secret Key Configuration
 * 
 * Apple OAuth secret keys expire every 6 months. This module tracks the
 * key generation date and provides helpers to determine if the key is
 * expiring soon, enabling admin notification banners.
 * 
 * After rotating the key in the Apple Developer Console and updating Supabase,
 * update APPLE_KEY_GENERATION_DATE to the new generation date.
 * 
 * Rotation process (manual):
 * 1. Use the .p8 file at /code/secrets/AuthKey_95U9T66Z3W.p8
 * 2. Generate a new secret using the tool at https://supabase.com/docs/guides/auth/social-login/auth-apple
 * 3. Paste the new secret into Supabase Dashboard → Auth → Providers → Apple
 * 4. Update APPLE_KEY_GENERATION_DATE below to today's date
 */

// --- Configuration ---
// Update this date after each key rotation
export const APPLE_KEY_GENERATION_DATE = '2026-02-07';

// Key expires 6 months after generation
export const APPLE_KEY_EXPIRY_MONTHS = 6;

// Show admin warnings this many days before expiry
export const APPLE_KEY_WARNING_DAYS = 14;

// Apple identifiers (for reference)
export const APPLE_SERVICES_ID = 'com.aimatrx.web';
export const APPLE_TEAM_ID = 'JH83UH9P4D';
export const APPLE_SIGNING_KEY_ID = '95U9T66Z3W';

// --- Helpers ---

export function getAppleKeyExpiryDate(): Date {
    const generationDate = new Date(APPLE_KEY_GENERATION_DATE);
    const expiryDate = new Date(generationDate);
    expiryDate.setMonth(expiryDate.getMonth() + APPLE_KEY_EXPIRY_MONTHS);
    return expiryDate;
}

export function getAppleKeyWarningDate(): Date {
    const expiryDate = getAppleKeyExpiryDate();
    const warningDate = new Date(expiryDate);
    warningDate.setDate(warningDate.getDate() - APPLE_KEY_WARNING_DAYS);
    return warningDate;
}

export function isAppleKeyExpiringSoon(): boolean {
    const now = new Date();
    return now >= getAppleKeyWarningDate();
}

export function isAppleKeyExpired(): boolean {
    const now = new Date();
    return now >= getAppleKeyExpiryDate();
}

export function getDaysUntilAppleKeyExpiry(): number {
    const now = new Date();
    const expiryDate = getAppleKeyExpiryDate();
    const diffMs = expiryDate.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getAppleKeyExpiryMessage(): string {
    const expiryDate = getAppleKeyExpiryDate();
    const formattedDate = expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const daysLeft = getDaysUntilAppleKeyExpiry();

    if (daysLeft <= 0) {
        return `Apple Sign-In secret key EXPIRED on ${formattedDate}. Apple sign-in is broken for all users! Please regenerate immediately in the Apple Developer Console and update Supabase.`;
    }

    return `Apple Sign-In secret key expires on ${formattedDate} (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining). Please regenerate it in the Apple Developer Console and update Supabase.`;
}
