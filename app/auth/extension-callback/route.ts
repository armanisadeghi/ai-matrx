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
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Matrx Extend sign-in</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #f5f7fa; color: #17212f; }
    main { box-sizing: border-box; width: min(420px, calc(100vw - 40px)); padding: 36px; border: 1px solid #e4e8ef; border-radius: 22px; background: #fff; box-shadow: 0 18px 48px #17212f12; }
    .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; background: #17212f; color: #fff; font-size: 23px; font-weight: 700; }
    h1 { margin: 28px 0 10px; font-size: 25px; line-height: 1.2; letter-spacing: -.025em; }
    p { margin: 0; color: #5b6778; font-size: 15px; line-height: 1.6; }
    @media (prefers-color-scheme: dark) { body { background: #11161d; color: #f4f6fa; } main { background: #1a222d; border-color: #303b49; box-shadow: none; } .mark { background: #f4f6fa; color: #17212f; } p { color: #b1bdca; } }
  </style>
</head>
<body><main><div class="mark" aria-hidden="true">M</div><h1>Return to Matrx Extend</h1><p>Your sign-in is finishing in the extension. If it does not complete, open Matrx Extend and try again.</p></main></body>
</html>`,
    { headers: callbackHeaders("text/html; charset=utf-8") },
  );
}

function callbackHeaders(contentType: string): HeadersInit {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
  };
}
