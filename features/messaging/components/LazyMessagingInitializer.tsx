'use client';

// LazyMessagingInitializer — Mounts MessagingInitializer as soon as a user is
// authenticated so the avatar-dropdown unread badge is accurate from first
// paint. Previously gated on the sheet being opened, which left the badge
// stuck at 0 until the user clicked the icon.

import { useAppSelector } from '@/lib/redux/hooks';
import {
    selectAccessToken,
    selectUserId,
} from '@/lib/redux/selectors/userSelectors';
import dynamic from 'next/dynamic';

const MessagingInitializer = dynamic(
    () => import('./MessagingInitializer').then((m) => m.MessagingInitializer),
    { ssr: false, loading: () => null }
);

export default function LazyMessagingInitializer() {
    const userId = useAppSelector(selectUserId);
    const accessToken = useAppSelector(selectAccessToken);

    // Redux identity and the browser's Supabase session are hydrated in
    // separate steps. Mounting in between makes the authenticated-only DM RPC
    // execute as `anon`, producing a real 42501 before auth finishes. Identity
    // alone is not authority: wait until the session token exists.
    if (!userId || !accessToken) return null;
    return <MessagingInitializer />;
}
