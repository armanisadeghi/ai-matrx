// components/admin/debug/buildAgentContext.ts
//
// Assembles a complete, clipboard-ready debug context snapshot for an AI agent.
// All data comes from Redux state — call this from within a component that has
// access to the store via selectors.
//
// Output format:
//   Structured markdown with clearly labeled sections so an AI agent can
//   immediately understand: what page, what state, what errors, which server,
//   what API calls were made.

import type { RouteContext, ConsoleErrorEntry } from '@/lib/redux/preferences/adminDebugSlice';
import type { ApiCallLogEntry, ServerEnvironment } from '@/lib/redux/slices/apiConfigSlice';

interface AgentContextInput {
    routeContext: RouteContext | null;
    debugData: Record<string, unknown>;
    consoleErrors: ConsoleErrorEntry[];
    activeServer: ServerEnvironment;
    resolvedUrl: string | undefined;
    serverHealthStatus: string;
    serverLatencyMs: number | null;
    recentApiCalls: ApiCallLogEntry[];
    userEmail: string | null | undefined;
}

export function buildAgentContext(input: AgentContextInput): string {
    const {
        routeContext,
        debugData,
        consoleErrors,
        activeServer,
        resolvedUrl,
        serverHealthStatus,
        serverLatencyMs,
        recentApiCalls,
        userEmail,
    } = input;

    const now = new Date().toISOString();
    const lines: string[] = [];

    lines.push('# Admin Debug Context Snapshot');
    lines.push(`Generated: ${now}`);
    lines.push(`Admin: ${userEmail ?? 'unknown'}`);
    lines.push('');

    // ── Route ──────────────────────────────────────────────────────────────
    lines.push('## Route');
    if (routeContext) {
        lines.push(`- **Path:** ${routeContext.pathname}`);
        const params = Object.entries(routeContext.searchParams);
        if (params.length > 0) {
            lines.push(`- **Search Params:** ${params.map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
        lines.push(`- **Viewport:** ${routeContext.viewportWidth}×${routeContext.viewportHeight}`);
        lines.push(`- **Render Count:** ${routeContext.renderCount}`);
        lines.push(`- **Captured:** ${new Date(routeContext.capturedAt).toLocaleTimeString()}`);
    } else {
        lines.push('- Route context not yet captured');
    }
    lines.push('');

    // ── API Config ─────────────────────────────────────────────────────────
    lines.push('## API Config');
    lines.push(`- **Active Server:** ${activeServer}`);
    lines.push(`- **Backend URL:** ${resolvedUrl ?? 'NOT CONFIGURED'}`);
    lines.push(`- **Health:** ${serverHealthStatus}${serverLatencyMs != null ? ` (${serverLatencyMs}ms)` : ''}`);
    lines.push('');

    // ── Feature Debug Data ─────────────────────────────────────────────────
    const debugEntries = Object.entries(debugData);
    if (debugEntries.length > 0) {
        lines.push('## Feature Debug Data');
        // Group by namespace
        const groups: Record<string, Array<[string, unknown]>> = {};
        for (const [rawKey, value] of debugEntries) {
            const colonIdx = rawKey.indexOf(':');
            const ns = colonIdx !== -1 ? rawKey.slice(0, colonIdx) : 'General';
            const label = colonIdx !== -1 ? rawKey.slice(colonIdx + 1) : rawKey;
            if (!groups[ns]) groups[ns] = [];
            groups[ns].push([label, value]);
        }
        for (const [ns, entries] of Object.entries(groups)) {
            lines.push(`### ${ns}`);
            for (const [label, value] of entries) {
                const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
                lines.push(`- **${label}:** ${display}`);
            }
        }
        lines.push('');
    }

    // ── Recent API Calls ───────────────────────────────────────────────────
    if (recentApiCalls.length > 0) {
        lines.push('## Recent API Calls (newest first)');
        const cols = 'Status | Method | Path | HTTP | Duration';
        const sep  = '-------|--------|------|------|----------';
        lines.push(`| ${cols} |`);
        lines.push(`| ${sep} |`);
        for (const call of recentApiCalls.slice(0, 20)) {
            const status = call.status === 'success' ? '✓' : call.status === 'error' ? '✗' : '…';
            const http = call.httpStatus != null ? String(call.httpStatus) : '—';
            const dur = call.durationMs != null ? `${call.durationMs}ms` : '—';
            lines.push(`| ${status} | ${call.method} | ${call.path} | ${http} | ${dur} |`);
        }
        lines.push('');
    }

    // ── Console Errors ─────────────────────────────────────────────────────
    if (consoleErrors.length > 0) {
        lines.push('## Console Errors (newest first)');
        for (const err of consoleErrors.slice(0, 10)) {
            lines.push(`### [${err.source}] ${new Date(err.capturedAt).toLocaleTimeString()}`);
            lines.push('```');
            lines.push(err.message);
            if (err.stack) {
                lines.push('');
                lines.push(err.stack.split('\n').slice(0, 6).join('\n'));
            }
            lines.push('```');
        }
        lines.push('');
    } else {
        lines.push('## Console Errors');
        lines.push('No errors captured.');
        lines.push('');
    }

    lines.push('---');
    lines.push('*Paste this snapshot into an AI agent chat to get full context about the current state of the application.*');

    return lines.join('\n');
}
