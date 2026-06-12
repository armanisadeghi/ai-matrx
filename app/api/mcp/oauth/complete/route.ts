import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight page shown in the OAuth popup after callback.
 * It posts a message to the parent window and closes itself.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get("mcp_connected");
  const error = searchParams.get("mcp_error");

  const message = serverId
    ? JSON.stringify({ type: "mcp_oauth_complete", serverId })
    : JSON.stringify({
        type: "mcp_oauth_error",
        error: error ?? "Unknown error",
      });

  const html = `<!DOCTYPE html>
<html>
<head><title>MCP Connection</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100dvh; margin: 0; background: #111; color: #eee;">
<div style="text-align: center; max-width: 400px; padding: 2rem;">
  ${
    serverId
      ? '<p style="font-size: 1.25rem;">&#10003; Connected successfully</p><p style="color: #888;">This window will close automatically.</p>'
      : `<p style="font-size: 1.25rem; color: #f87171;">Connection failed</p><p style="color: #888;">${(error ?? "Unknown error").replace(/</g, "&lt;")}</p><p style="color: #666; font-size: 0.875rem;">You can close this window.</p>`
  }
</div>
<script>
  try {
    if (window.opener) {
      window.opener.postMessage(${message}, window.location.origin);
    }
  } catch(e) {}
  ${serverId ? "setTimeout(function() { window.close(); }, 1500);" : ""}
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
