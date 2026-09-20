import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserChatHistory } from '@/features/public-chat/services/cx-chat';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET /api/cx-chat/history
 *
 * Returns chat history for the current authenticated user.
 * Query params: ?limit=50&offset=0
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const supabase = await createClient();
        const { data: { user } } = await getClaimsUser(supabase);

        if (!user) {
            // Not authenticated — return empty (guest users don't persist yet)
            return NextResponse.json({ success: true, data: [] });
        }

        const history = await getUserChatHistory(user.id, limit, offset);
        return NextResponse.json({ success: true, data: history });
    } catch (error) {
        console.error('GET /api/cx-chat/history error:', error);
        // Return empty instead of 500 — table may not exist yet
        return NextResponse.json({ success: true, data: [] });
    }
}
