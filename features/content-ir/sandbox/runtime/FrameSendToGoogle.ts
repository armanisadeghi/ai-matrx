/**
 * FrameSendToGoogle — the sandbox frame's stand-in for
 * `@/features/google-workspace/export/sendToGoogle`.
 *
 * WHY. `CopyButtons` is allowlisted, and its export menu reaches
 * `useExportActions` → `sendToGoogle` → `features/google-workspace/service` →
 * `features/marketing/google/service` → `utils/supabase/client`. In the page
 * that is a lazy `import()`; in the frame esbuild inlines it, and the result
 * measured 2026-09-12 is the SUPABASE BROWSER CLIENT inside the sandbox —
 * `fetch`, `XMLHttpRequest`, `WebSocket`, the auth cookie helper, the whole
 * data door. The entire point of the frame is that this door does not exist
 * on the other side of it.
 *
 * It also could not work here even if it were bundled: sending to Google needs
 * the signed-in session and a network call, and the frame's CSP is
 * `connect-src 'none'`.
 *
 * NOTHING SILENT (Law 4): calling either function throws a sentence naming
 * what is unavailable and what to do instead. It never resolves with a fake
 * success. S2 may relay the request to the parent through the action bridge —
 * the same single door `runAction` already uses — but that is a decision for
 * S2, not a quiet fallback here.
 */

const MESSAGE =
    "Sending to Google Docs or Sheets happens in the main page, not inside a " +
    "Shape component's sandbox. Use Copy or one of the file exports here, or " +
    "open this Shape in its own page to send it to Google.";

export type SendToGoogleResult = {
    ok: false;
    error: string;
};

export function googleFileTitle(
    title: string | undefined,
    fallback: string,
): string {
    return (title ?? "").trim() || fallback;
}

export async function sendContentToGoogleDoc(): Promise<never> {
    throw new Error(MESSAGE);
}

export async function sendRowsToGoogleSheet(): Promise<never> {
    throw new Error(MESSAGE);
}
