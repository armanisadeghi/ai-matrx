/**
 * FrameSendToGoogle — the sandbox frame's stand-in for
 * `@/features/google-workspace/export/sendToGoogle`.
 *
 * WHY IT EXISTS. `CopyButtons` is allowlisted, and its export menu reaches
 * `useExportActions` → `sendToGoogle` → `features/google-workspace/service` →
 * `features/marketing/google/service` → `utils/supabase/client`. In the page
 * that is a lazy `import()`; in the frame esbuild inlines it, and the result
 * measured 2026-09-12 is the SUPABASE BROWSER CLIENT inside the sandbox —
 * `fetch`, `XMLHttpRequest`, `WebSocket`, the auth cookie helper, the whole
 * data door. The entire point of the frame is that this door does not exist on
 * the other side of it. It also could not work here even if it were bundled:
 * sending to Google needs the signed-in session and a network call, and the
 * frame's CSP is `connect-src 'none'`.
 *
 * WHAT S2 CHANGED (chair ruling 7). It is no longer a refusal. The request is
 * RELAYED to the host page through the ONE action bridge the component's own
 * `runAction` already uses (`matrx:sandbox:action` → `runAction`), so the work
 * happens where the session lives and the frame gains no capability. There is
 * no second door.
 *
 * NOTHING SILENT (Law 4): if the host has no handler registered for the relay
 * key, `runAction` answers `{ ok:false, error }` and that sentence comes back
 * to the author's UI as the failure reason — it never resolves with a fake
 * success and never claims a file was created.
 */
import { HOST_RELAY_ACTION_KEYS } from "../protocol";
import { requestHostAction } from "./host-action-relay";

const GOOGLE_TITLE_CHARACTER_CAP = 200;

export type SendToGoogleResult =
    | { ok: true; name: string; fileId: string; openUrl: string | null }
    | { ok: false; reason: "not_connected"; settingsHref: string }
    | { ok: false; reason: "failed"; message: string };

/** Identical to the real module's, so titles read the same either way. */
export function googleFileTitle(
    title: string | undefined,
    fallback: string,
): string {
    const cleaned = (title ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, GOOGLE_TITLE_CHARACTER_CAP);
    return cleaned || fallback;
}

function asResult(
    relayed: { ok: boolean; value?: unknown; error?: string },
    what: string,
): SendToGoogleResult {
    if (!relayed.ok) {
        return {
            ok: false,
            reason: "failed",
            message:
                relayed.error ??
                `The page could not send this ${what} to Google, and gave no reason.`,
        };
    }
    const value = (relayed.value ?? {}) as Record<string, unknown>;
    if (typeof value.fileId !== "string") {
        return {
            ok: false,
            reason: "failed",
            message: `The page reported success but did not say which Google file it created, so there is nothing to open.`,
        };
    }
    return {
        ok: true,
        name: typeof value.name === "string" ? value.name : "Untitled",
        fileId: value.fileId,
        openUrl: typeof value.openUrl === "string" ? value.openUrl : null,
    };
}

export async function sendContentToGoogleDoc(
    content: string,
    title?: string,
): Promise<SendToGoogleResult> {
    const relayed = await requestHostAction(HOST_RELAY_ACTION_KEYS.sendToGoogle, {
        target: "document",
        title: googleFileTitle(title, "AI Matrx document"),
        content,
    });
    return asResult(relayed, "document");
}

export async function sendRowsToGoogleSheet(
    rows: Array<Record<string, unknown>>,
    title?: string,
): Promise<SendToGoogleResult> {
    const relayed = await requestHostAction(HOST_RELAY_ACTION_KEYS.sendToGoogle, {
        target: "spreadsheet",
        title: googleFileTitle(title, "AI Matrx export"),
        rows,
    });
    return asResult(relayed, "spreadsheet");
}
