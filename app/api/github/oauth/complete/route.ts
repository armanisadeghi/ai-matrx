import { NextRequest, NextResponse } from "next/server";
import { safeReturnUrl } from "../session";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const connected = request.nextUrl.searchParams.get("github") === "connected";
  const error =
    request.nextUrl.searchParams.get("github_error") ??
    "GitHub connection failed.";
  const returnUrl = safeReturnUrl(
    request.nextUrl.searchParams.get("return_url"),
  );
  const message = connected
    ? { type: "github_oauth_complete" }
    : { type: "github_oauth_error", error };
  const serializedMessage = JSON.stringify(message).replaceAll("<", "\\u003c");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GitHub connection</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;background:#111;color:#eee">
<main style="text-align:center;max-width:400px;padding:2rem">
  <p style="font-size:1.25rem;${connected ? "" : "color:#f87171"}">${
    connected ? "✓ GitHub connected" : "Connection failed"
  }</p>
  <p style="color:#999">${
    connected ? "This window will close automatically." : escapeHtml(error)
  }</p>
  <a href="${escapeHtml(returnUrl)}" style="color:#93c5fd">Return to AI Matrx</a>
</main>
<script>
try {
  if (window.opener) window.opener.postMessage(${serializedMessage}, window.location.origin);
} catch (_) {}
${connected ? "setTimeout(function () { window.close(); }, 800);" : ""}
</script></body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
