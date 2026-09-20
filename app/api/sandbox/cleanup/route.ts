/**
 * Sandbox Cleanup API
 * 
 * POST /api/sandbox/cleanup - Permanently remove soft-deleted sandboxes older than retention period.
 * 
 * Can be called manually by admins or via Vercel Cron.
 * The primary cleanup mechanism is pg_cron (runs daily at 3 AM UTC).
 * This endpoint serves as a backup/manual trigger.
 * 
 * Query params:
 *   - retention_days (optional, default 7): Number of days to retain soft-deleted sandboxes
 * 
 * Protected by either:
 *   - Authenticated admin user
 *   - CRON_SECRET header (for Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export async function POST(request: NextRequest) {
    try {
        // Check for cron secret (Vercel Cron) or authenticated admin
        const cronSecret = request.headers.get('authorization');
        const isVercelCron = cronSecret === `Bearer ${process.env.CRON_SECRET}`;

        if (!isVercelCron) {
            // Fall back to user auth check
            const supabase = await createClient();
            const { data: { user }, error: authError } = await getClaimsUser(supabase);
            if (authError || !user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            // TODO: Add admin role check when available
        }

        const { searchParams } = new URL(request.url);
        const retentionDays = parseInt(searchParams.get('retention_days') || '7');

        const supabase = await createClient();

        // Call the cleanup function
        const { data, error } = await supabase
            .rpc('cleanup_deleted_sandboxes', { retention_days: retentionDays });

        if (error) {
            console.error('Sandbox cleanup error:', error);
            return NextResponse.json(
                { error: 'Cleanup failed', details: error.message },
                { status: 500 }
            );
        }

        const deletedCount = data || 0;

        return NextResponse.json({
            success: true,
            deleted_count: deletedCount,
            retention_days: retentionDays,
            message: deletedCount > 0
                ? `Permanently removed ${deletedCount} sandbox instance(s) older than ${retentionDays} days`
                : 'No expired sandboxes to clean up',
        });
    } catch (error) {
        console.error('Sandbox cleanup API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
