import { NextRequest, NextResponse } from 'next/server'
import { resolveProxyContext, forwardToOrchestrator } from '@/lib/sandbox/proxy-helpers'

export const maxDuration = 180

interface CloneRequest {
    url?: unknown
    dest?: unknown
    branch?: unknown
}

function cloneRequestError(body: CloneRequest): string | null {
    if (typeof body.url !== 'string' || body.url.startsWith('-')) {
        return 'Repository URL must be an HTTPS URL.'
    }
    try {
        const url = new URL(body.url)
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
            return 'Repository URL must not contain credentials, query parameters, or fragments.'
        }
    } catch {
        return 'Repository URL must be an HTTPS URL.'
    }
    if (typeof body.dest !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(body.dest)) {
        return 'Destination must be one safe folder name.'
    }
    if (body.branch !== undefined && (typeof body.branch !== 'string' || body.branch.startsWith('-'))) {
        return 'Branch names cannot start with a dash.'
    }
    return null
}

async function validateCloneRequest(request: NextRequest): Promise<NextResponse | null> {
    let body: CloneRequest
    try {
        body = await request.clone().json() as CloneRequest
    } catch {
        return NextResponse.json({ detail: 'Clone request must be valid JSON.' }, { status: 400 })
    }
    const error = cloneRequestError(body)
    return error
        ? NextResponse.json({ detail: error }, { status: 400 })
        : null
}

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
    const subpath = (path || []).join('/')
    if (request.method === 'POST' && subpath === 'clone') {
        const invalid = await validateCloneRequest(request)
        if (invalid) return invalid
    }
    const ctx = await resolveProxyContext(id)
    if (!ctx.ok) return ctx.response

    const search = request.nextUrl.search
    const upstreamUrl = `${ctx.orchestrator.url}/sandboxes/${ctx.sandboxId}/git/${subpath}${search}`

    return forwardToOrchestrator(request, upstreamUrl, ctx.orchestrator, { timeoutMs: 120_000 })
}

export const GET = handle
export const POST = handle
