/**
 * Markdown Print Utility (internalized)
 *
 * Opens a print-ready window from markdown content.
 * Originally from features/chat/utils/markdown-print-utils.ts.
 *
 * NOTE: This depends on `removeThinkingContent` from
 * @/components/matrx/buttons/markdown-copy-utils — that function
 * strips <thinking> blocks from markdown. We re-implement a minimal
 * version here to avoid the external dependency.
 *
 * The print-window plumbing (window.open + popup-blocked download fallback)
 * and HTML escaping come from `@ai-matrx/print/core`; only the markdown→HTML
 * conversion and this surface's own document styles are local.
 */

import { escapeHtml, openPrintWindow } from "@ai-matrx/print/core";

// ============================================================================
// THINKING CONTENT REMOVAL (minimal re-implementation)
// ============================================================================

function removeThinkingContent(markdown: string): string {
    // Remove <thinking>...</thinking> blocks (case insensitive, multiline)
    return markdown.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

// ============================================================================
// MARKDOWN → HTML CONVERSION
// ============================================================================

function convertMarkdownTablesForPrint(html: string): string {
    const tableRegex = /^(\|.*\|)\s*\n(\|[-\s:|]*\|)\s*\n((?:\|.*\|\s*\n?)*)/gm;
    return html.replace(tableRegex, (_match, headerRow, _sep, bodyRows) => {
        const headers = headerRow.split('|').map((c: string) => c.trim()).filter((c: string) => c !== '');
        const rows = bodyRows.trim().split('\n').filter((r: string) => r.trim())
            .map((r: string) => r.split('|').map((c: string) => c.trim()).filter((c: string) => c !== ''));

        let t = '<table class="print-table">\n';
        if (headers.length) {
            t += '<thead><tr>' + headers.map((h: string) => `<th>${h}</th>`).join('') + '</tr></thead>\n';
        }
        if (rows.length) {
            t += '<tbody>' + rows.map((r: string[]) => r.length ? '<tr>' + r.map((c: string) => `<td>${c}</td>`).join('') + '</tr>' : '').join('\n') + '</tbody>\n';
        }
        return t + '</table>\n';
    });
}

function markdownToPrintBodyHTML(markdown: string): string {
    if (!markdown) return '';
    let html = removeThinkingContent(markdown);
    html = convertMarkdownTablesForPrint(html);

    // Code blocks
    const codeBlockPlaceholders: Array<{ placeholder: string; html: string }> = [];
    let codeIdx = 0;
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
        const ph = `ΩCODEBLOCKΩ${codeIdx}ΩCODEBLOCKΩ`;
        const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
        codeBlockPlaceholders.push({ placeholder: ph, html: `<div class="code-block-wrapper">${langLabel}<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre></div>` });
        codeIdx++;
        return ph;
    });

    // Links
    const linkPlaceholders: Array<{ placeholder: string; html: string }> = [];
    let linkIdx = 0;
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
        const ph = `ΩLINKΩ${linkIdx}ΩLINKΩ`;
        linkPlaceholders.push({ placeholder: ph, html: `<a href="${url}">${text}</a>` });
        linkIdx++;
        return ph;
    });

    // Headings
    html = html
        .replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>')
        .replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>')
        .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/^[-*_]{3,}$/gm, '<hr>');
    html = html
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/___(.+?)___/g, '<strong><em>$1</em></strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/_([^_\s][^_]*)_/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Lists
    const lines = html.split('\n');
    const result: string[] = [];
    let inUl = false, inOl = false;
    for (const line of lines) {
        const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
        const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
        if (ulMatch) {
            if (inOl) { result.push('</ol>'); inOl = false; }
            if (!inUl) { result.push('<ul>'); inUl = true; }
            result.push(`<li>${ulMatch[2]}</li>`);
        } else if (olMatch) {
            if (inUl) { result.push('</ul>'); inUl = false; }
            if (!inOl) { result.push('<ol>'); inOl = true; }
            result.push(`<li>${olMatch[2]}</li>`);
        } else {
            if (inUl) { result.push('</ul>'); inUl = false; }
            if (inOl) { result.push('</ol>'); inOl = false; }
            result.push(line);
        }
    }
    if (inUl) result.push('</ul>');
    if (inOl) result.push('</ol>');
    html = result.join('\n');

    // Wrap paragraphs
    html = html.split('\n').map(line => {
        const t = line.trim();
        if (!t) return '';
        if (/^<(h[1-6]|ul|ol|li|blockquote|pre|hr|table|thead|tbody|tr|th|td|div|ΩCODE)/.test(t)) return line;
        return `<p>${t}</p>`;
    }).join('\n');

    codeBlockPlaceholders.forEach(({ placeholder, html: ph }) => {
        html = html.replace(placeholder, ph);
        html = html.replace(`<p>${placeholder}</p>`, ph);
    });
    linkPlaceholders.forEach(({ placeholder, html: ph }) => { html = html.replace(placeholder, ph); });

    return html;
}

// ============================================================================
// PRINT DOCUMENT
// ============================================================================

/**
 * This surface's own document shell — the package's `buildPrintDocument`
 * ships a sans-serif utility style set, while this one is the serif,
 * article-styled AI-response sheet (code blocks, blockquotes, link
 * footnotes). Kept local so printed output is unchanged.
 */
function buildMarkdownPrintDocument(bodyHtml: string, title: string): string {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title>
<style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,'Times New Roman',serif;font-size:11pt;line-height:1.7;color:#1a1a1a;background:#fff;max-width:780px;margin:0 auto;padding:32px 40px}.print-actions{display:flex;gap:10px;margin-bottom:28px;padding-bottom:20px;border-bottom:2px solid #e5e7eb}.print-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:8px;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;border:none;font-weight:600;transition:opacity .15s}.print-btn:hover{opacity:.85}.print-btn-primary{background:#2563eb;color:#fff}.print-btn-secondary{background:#f3f4f6;color:#374151;border:1px solid #d1d5db}h1,h2,h3,h4,h5,h6{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',sans-serif;font-weight:700;line-height:1.3;color:#111827;margin-top:1.6em;margin-bottom:.5em;page-break-after:avoid}h1{font-size:24pt;border-bottom:2px solid #e5e7eb;padding-bottom:.3em;margin-top:0}h2{font-size:18pt;border-bottom:1px solid #e5e7eb;padding-bottom:.2em}h3{font-size:14pt}p{margin-bottom:.9em;orphans:3;widows:3}a{color:#2563eb;text-decoration:underline;word-break:break-word}ul,ol{margin:.6em 0 .9em 0;padding-left:1.8em}li{margin-bottom:.3em;page-break-inside:avoid}blockquote{margin:1em 0;padding:.7em 1em .7em 1.2em;border-left:4px solid #6366f1;background:#f5f3ff;border-radius:0 6px 6px 0;color:#374151;font-style:italic;page-break-inside:avoid}.inline-code{font-family:'JetBrains Mono','Fira Code',monospace;font-size:9.5pt;background:#f1f5f9;color:#0f172a;padding:1px 5px;border-radius:4px;border:1px solid #e2e8f0}.code-block-wrapper{position:relative;margin:1em 0 1.2em;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;page-break-inside:avoid}.code-lang{display:block;font-family:-apple-system,sans-serif;font-size:9pt;font-weight:600;color:#64748b;background:#f8fafc;padding:4px 12px;border-bottom:1px solid #e2e8f0;text-transform:uppercase;letter-spacing:.05em}.code-block{margin:0;padding:14px 16px;background:#0f172a;color:#e2e8f0;font-family:'JetBrains Mono',monospace;font-size:9pt;line-height:1.6;overflow-x:auto;white-space:pre;tab-size:2}.print-table{width:100%;border-collapse:collapse;margin:1em 0 1.2em;font-size:10pt;page-break-inside:avoid}.print-table th{background:#1e293b;color:#f8fafc;font-family:-apple-system,sans-serif;font-weight:600;font-size:9.5pt;text-align:left;padding:8px 12px;border:1px solid #334155}.print-table td{padding:7px 12px;border:1px solid #e2e8f0;vertical-align:top}.print-table tr:nth-child(even) td{background:#f8fafc}hr{border:none;border-top:2px solid #e5e7eb;margin:1.5em 0}@media print{body{max-width:100%;padding:0;font-size:10.5pt}.print-actions{display:none!important}.code-block,.print-table th,blockquote{color-adjust:exact;-webkit-print-color-adjust:exact;print-color-adjust:exact}a[href]::after{content:" ("attr(href)")";font-size:9pt;color:#64748b}a[href^="#"]::after,a[href^="javascript:"]::after{content:""}h1,h2,h3{page-break-after:avoid}pre,blockquote,table{page-break-inside:avoid}}</style></head>
<body><div class="print-actions"><button class="print-btn print-btn-primary" onclick="window.print()">Print / Save as PDF</button><button class="print-btn print-btn-secondary" onclick="window.close()">Close</button></div><div class="content">${bodyHtml}</div></body></html>`;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function printMarkdownContent(markdown: string, title = 'AI Response'): void {
    const bodyHtml = markdownToPrintBodyHTML(markdown);
    openPrintWindow(buildMarkdownPrintDocument(bodyHtml, title), title);
}
