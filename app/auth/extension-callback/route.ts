/**
 * A neutral landing page for browser-extension PKCE callbacks.
 *
 * The extension owns the verifier and exchanges the one-time code itself.
 * This route never reads, logs, exchanges, or renders callback parameters.
 */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const forbidden = ["access_token", "refresh_token", "id_token", "token"];
  if (forbidden.some((name) => url.searchParams.has(name))) {
    return new Response("Invalid extension sign-in callback.", {
      status: 400,
      headers: callbackHeaders("text/plain; charset=utf-8"),
    });
  }

  return new Response(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Matrx Extend sign-in</title></head><body><main><h1>Return to Matrx Extend</h1><p>Your sign-in is finishing in the extension. If it does not complete, open Matrx Extend and try again.</p></main></body></html>',
    { headers: callbackHeaders("text/html; charset=utf-8") },
  );
}

function callbackHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
  };
}
