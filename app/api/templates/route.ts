import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import {
    resolveOrchestratorByTier,
    orchestratorJsonHeaders,
} from '@/lib/sandbox/orchestrator-routing'
import type { SandboxTier } from '@/types/sandbox'

/**
 * GET /api/templates?tier=ec2|hosted
 *
 * Returns the list of sandbox templates available on the requested tier.
 * Defaults to 'ec2' for backward compatibility. Each tier's orchestrator
 * advertises its own template list via /templates — they may differ if the
 * two tiers ship different images.
 *
 * The auth check is the standard Supabase user check; no per-template ACLs.
 */
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

        const tierParam = request.nextUrl.searchParams.get('tier') as SandboxTier | null
        const tier: SandboxTier = tierParam === 'hosted' ? 'hosted' : 'ec2'
        const target = resolveOrchestratorByTier(tier)

        let resp: Response
        try {
            const orchestratorUrl = new URL(`${target.url}/templates`)
            orchestratorUrl.searchParams.set('user_id', user.id)
            resp = await fetch(orchestratorUrl, {
                method: 'GET',
                headers: orchestratorJsonHeaders(target),
            })
        } catch (fetchError) {
            console.error(`Orchestrator templates fetch failed (${tier}):`, fetchError)
            return NextResponse.json(
                { error: `Orchestrator (${tier}) is not reachable` },
                { status: 502 }
            )
        }

        if (!resp.ok) {
            // Pre-v0.2.0 orchestrators don't have /templates yet — fall back to
            // a hardcoded default so the create dialog still works.
            if (resp.status === 404) {
                return NextResponse.json({
                    templates: [
                        {
                            id: 'bare',
                            version: '1',
                            description: 'Default sandbox.',
                            image: 'matrx-sandbox:latest',
                            tier,
                            languages: ['python', 'node', 'bash'],
                        },
                    ],
                    fallback: true,
                })
            }
            const errBody = await resp.text()
            return NextResponse.json(
                { error: 'Failed to fetch templates', details: errBody },
                { status: resp.status >= 500 ? 502 : resp.status }
            )
        }

        const data = await resp.json()
        return NextResponse.json(data)
    } catch (error) {
        console.error('Templates API error:', error)
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
