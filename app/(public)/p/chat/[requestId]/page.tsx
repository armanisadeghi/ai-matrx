// app/(public)/p/chat/[requestId]/page.tsx
import { redirect } from 'next/navigation';

// Basic UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Legacy Chat Route — redirects to the canonical /p/chat/c/[id] route.
 * Kept for backward compatibility with shared links.
 *
 * Only redirects when `requestId` looks like a valid UUID.
 * Non-UUID values (e.g. bare "a" from /p/chat/a without an agent ID)
 * are sent to the base /p/chat route instead of producing a 404/DB error.
 */
export default async function LegacyChatPage({
    params,
}: {
    params: Promise<{ requestId: string }>;
}) {
    const { requestId } = await params;

    if (UUID_RE.test(requestId)) {
        redirect(`/p/chat/c/${requestId}`);
    }

    // Not a valid conversation ID — go to the base chat page
    redirect('/p/chat');
}
