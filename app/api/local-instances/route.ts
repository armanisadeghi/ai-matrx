/**
 * GET /api/local-instances
 *
 * Returns all registered Matrx Local instances for the authenticated user,
 * including tunnel status so mobile/web clients can discover which PC is
 * accessible remotely.
 *
 * - Validates the user's Supabase session via SSR cookies
 * - Queries app_instances filtered to auth.uid() (RLS enforced on DB side too)
 * - Filters out stale instances (last_seen older than 10 minutes) from the
 *   "online" indicator, but still returns them so users see all devices
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getClaimsUser } from "@/utils/supabase/resolveUser";

export interface LocalInstance {
  id: string;
  instance_id: string;
  instance_name: string;
  platform: string | null;
  os_version: string | null;
  architecture: string | null;
  hostname: string | null;
  cpu_model: string | null;
  cpu_cores: number | null;
  ram_total_gb: number | null;
  is_active: boolean;
  last_seen: string;
  tunnel_url: string | null;
  tunnel_active: boolean;
  tunnel_updated_at: string | null;
  is_online: boolean; // computed: last_seen within last 10 minutes
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await getClaimsUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: instances, error: dbError } = await supabase
      .from('app_instances')
      .select(`
        id,
        instance_id,
        instance_name,
        platform,
        os_version,
        architecture,
        hostname,
        cpu_model,
        cpu_cores,
        ram_total_gb,
        is_active,
        last_seen,
        tunnel_url,
        tunnel_active,
        tunnel_updated_at
      `)
      .eq('user_id', user.id)
      .order('last_seen', { ascending: false });

    if (dbError) {
      console.error('[local-instances] Supabase error:', dbError.message);
      return NextResponse.json({ error: 'Failed to fetch instances' }, { status: 500 });
    }

    const now = Date.now();
    const result: LocalInstance[] = (instances ?? []).map((inst) => ({
      ...inst,
      is_online: inst.last_seen
        ? now - new Date(inst.last_seen).getTime() < STALE_THRESHOLD_MS
        : false,
    }));

    return NextResponse.json({ instances: result });
  } catch (err) {
    console.error('[local-instances] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
