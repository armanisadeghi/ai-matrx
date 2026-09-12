import { NextRequest } from 'next/server'
import { resolveProxyContext, forwardToOrchestrator } from '@/lib/sandbox/proxy-helpers'

export const maxDuration = 180

/**
 * Catchall proxy for the sandbox git API.
 *
 * Forwards GET/POST under /api/sandbox/[id]/git/... to the orchestrator's
 * /sandboxes/{sandbox_id}/git/... which delegates to the in-container daemon.
 *
 * Endpoints (per orchestrator's matrx_agent daemon):
 *   POST /git/clone, /git/add, /git/commit, /git/push, /git/pull,
 *        /git/branch, /git/stash
 *   GET  /git/status, /git/diff, /git/log
 *
 * Long timeout: clones can take a while. Aligns with the orchestrator's
 * 120s default for /git proxies.
 */

async function handle(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; path: string[] }> }
) {
    const { id, path } = await params
    const ctx = await resolveProxyContext(id)
    if (!ctx.ok) return ctx.response

    const subpath = (path || []).join('/')
    const search = request.nextUrl.search
    const upstreamUrl = `${ctx.orchestrator.url}/sandboxes/${ctx.sandboxId}/git/${subpath}${search}`

    return forwardToOrchestrator(request, upstreamUrl, ctx.orchestrator, { timeoutMs: 120_000 })
}

export const GET = handle
export const POST = handle
