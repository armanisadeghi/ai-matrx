import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET /api/cx-chat/shared
 *
 * Returns conversations shared with the current authenticated user.
 * Uses the get_cx_conversations_shared_with_me() RPC function.
 */
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await getClaimsUser(supabase);

        if (!user) {
            return NextResponse.json({ conversations: [] });
        }

        const { data, error } = await supabase.rpc('get_cx_conversations_shared_with_me');

        if (error) {
            console.error('RPC get_cx_conversations_shared_with_me error:', error);
            return NextResponse.json(
                { conversations: [], error: 'Failed to fetch shared conversations' },
                { status: 500 },
            );
        }

        return NextResponse.json({ conversations: data || [] });
    } catch (error) {
        console.error('GET /api/cx-chat/shared error:', error);
        return NextResponse.json(
            { conversations: [], error: 'Failed to fetch shared conversations' },
            { status: 500 },
        );
    }
}
