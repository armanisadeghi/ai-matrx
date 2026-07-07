import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { checkIsSuperAdmin } from '@/utils/supabase/userSessionData'

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
        }

        const isAdmin = await checkIsSuperAdmin(supabase, user.id)
        if (!isAdmin) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const searchParams = request.nextUrl.searchParams
        const status = searchParams.get('status')
        const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200)
        const offset = parseInt(searchParams.get('offset') || '0')

        let query = supabase
            .from('sandbox_instances')
            .select('*', { count: 'exact' })
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (status && status !== 'all') {
            query = query.eq('status', status)
        }

        const { data, error, count } = await query

        if (error) {
            console.error('Error fetching sandbox instances:', error)
            return NextResponse.json(
                { error: 'Failed to fetch sandbox instances', details: error.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            instances: data || [],
            pagination: {
                total: count || 0,
                limit,
                offset,
                hasMore: (count || 0) > offset + limit,
            },
        })
    } catch (error) {
        console.error('Admin sandbox list API error:', error)
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
