import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/admin/feedback/list-lite
 * Returns a lightweight list of all feedback items (id, description snippet, type, status)
 * Used for the parent-item picker in FeedbackDetailDialog
 */
export async function GET() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
        .schema('users').from('user_feedback')
        .select('id, description, feedback_type, status')
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        items: (data ?? []).map(item => ({
            id: item.id,
            description: item.description?.slice(0, 100) ?? '',
            feedback_type: item.feedback_type,
            status: item.status,
        }))
    });
}
