import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * GET  /api/sandbox/deploy → latest matrx-sandbox GHA deploy status
 * POST /api/sandbox/deploy → trigger a fresh deploy via workflow_dispatch
 *
 * Powers the "deploy state" card on the admin Sandbox Infrastructure panel.
 * Catches the silent-deploy-failure mode that left EC2 stale for 73 days.
 *
 * Requires `MATRX_SANDBOX_GH_TOKEN` env var on the server: a GitHub PAT with
 * `actions:read,write` scope on `armanisadeghi/matrx-sandbox`. Without it,
 * GET still works (uses the unauthenticated GitHub API at low rate limits)
 * and POST returns 501.
 */

const GH_OWNER = 'armanisadeghi'
const GH_REPO = 'matrx-sandbox'
const GH_WORKFLOW = 'deploy.yml'
const GH_TOKEN = process.env.MATRX_SANDBOX_GH_TOKEN || process.env.GITHUB_TOKEN || ''

function ghHeaders(): Record<string, string> {
    const h: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if (GH_TOKEN) h.Authorization = `Bearer ${GH_TOKEN}`
    return h
}

export async function GET(_request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
            error: userError,
        } = await getClaimsUser(supabase)
        if (userError || !user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
        }

        const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/runs?per_page=5`
        const resp = await fetch(url, {
            headers: ghHeaders(),
            signal: AbortSignal.timeout(8000),
        })

        if (!resp.ok) {
            const txt = await resp.text().catch(() => resp.statusText)
            return NextResponse.json(
                { error: 'GitHub API error', status: resp.status, details: txt },
                { status: 502 }
            )
        }

        const data = await resp.json()
        const runs = (data.workflow_runs || []).slice(0, 5).map((r: Record<string, unknown>) => ({
            id: r.id,
            run_number: r.run_number,
            status: r.status,
            conclusion: r.conclusion,
            head_branch: r.head_branch,
            head_sha: r.head_sha,
            event: r.event,
            display_title: r.display_title,
            actor: (r.actor as Record<string, unknown> | null)?.login,
            created_at: r.created_at,
            updated_at: r.updated_at,
            run_started_at: r.run_started_at,
            html_url: r.html_url,
        }))

        return NextResponse.json({
            workflow: GH_WORKFLOW,
            repo: `${GH_OWNER}/${GH_REPO}`,
            tokenAttached: !!GH_TOKEN,
            runs,
        })
    } catch (error) {
        console.error('GitHub deploy status fetch error:', error)
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

export async function POST(_request: NextRequest) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
            error: userError,
        } = await getClaimsUser(supabase)
        if (userError || !user) {
            return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
        }

        if (!GH_TOKEN) {
            return NextResponse.json(
                {
                    error: 'No GitHub token configured (MATRX_SANDBOX_GH_TOKEN)',
                    details:
                        'Triggering a deploy requires a PAT with actions:write scope. ' +
                        'Set MATRX_SANDBOX_GH_TOKEN in Vercel and redeploy.',
                },
                { status: 501 }
            )
        }

        const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: 'main' }),
            signal: AbortSignal.timeout(8000),
        })

        if (!resp.ok) {
            const txt = await resp.text().catch(() => resp.statusText)
            return NextResponse.json(
                { error: 'Failed to dispatch workflow', status: resp.status, details: txt },
                { status: 502 }
            )
        }

        // GitHub returns 204 with no body for successful dispatch.
        return NextResponse.json({
            ok: true,
            dispatched: true,
            note: 'GitHub Actions queued the workflow. Refresh the runs list to see progress.',
        })
    } catch (error) {
        console.error('GitHub workflow dispatch error:', error)
        return NextResponse.json(
            {
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}
