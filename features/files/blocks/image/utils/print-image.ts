/**
 * features/files/blocks/image/utils/print-image.ts
 *
 * Print an image via a hidden iframe + window.print(). Avoids the
 * pop-up-blocker problem of `window.open()` while still giving the
 * browser a clean, image-only document to print (no surrounding chat
 * UI, controls, or text).
 *
 * The flow:
 *   1. Append a hidden iframe to the document.
 *   2. Write a minimal image-only HTML doc into it via `srcdoc`.
 *   3. Wait for the *inner* <img> to load (the iframe's `load` event
 *      fires before the image bytes are ready, so we listen to the
 *      image directly).
 *   4. Call `print()` on the iframe's window.
 *   5. Clean up the iframe after a short tick (the print dialog is
 *      modal — by the time we cleanup, it's already been shown).
 *
 * Errors and edge cases:
 *   - If the image fails to load (CORS, expired signed URL, etc.) we
 *     reject so the caller can show a toast and bail. The iframe is
 *     still cleaned up.
 *   - We cap the wait at 30 seconds — if the image still hasn't loaded
 *     by then, something is genuinely wrong; reject with a clear
 *     message rather than hang.
 */

export interface PrintImageOptions {
  /** Browser tab title while the print dialog is open. */
  title?: string;
  /** Hard timeout for image load (ms). Default 30_000. */
  loadTimeoutMs?: number;
}

export async function printImage(
  imageUrl: string,
  options: PrintImageOptions = {},
): Promise<void> {
  if (!imageUrl) {
    throw new Error("print-image: no URL provided");
  }
  if (typeof window === "undefined") {
    throw new Error("print-image: must be called from the browser");
  }

  const { title = "Image", loadTimeoutMs = 30_000 } = options;

  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let settled = false;
    const cleanup = () => {
      // Defer one tick so the browser's print dialog has a window to
      // attach to before we yank it.
      window.setTimeout(() => {
        iframe.parentNode?.removeChild(iframe);
      }, 1_000);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const timeoutId = window.setTimeout(() => {
      fail(
        new Error(`print-image: image did not load within ${loadTimeoutMs}ms`),
      );
    }, loadTimeoutMs);

    iframe.addEventListener("load", () => {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      if (!doc || !win) {
        window.clearTimeout(timeoutId);
        fail(new Error("print-image: iframe context unavailable"));
        return;
      }
      const img = doc.querySelector("img");
      if (!img) {
        window.clearTimeout(timeoutId);
        fail(new Error("print-image: image element not found"));
        return;
      }

      const onReady = () => {
        window.clearTimeout(timeoutId);
        try {
          win.focus();
          win.print();
          succeed();
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      if (img.complete && img.naturalWidth > 0) {
        onReady();
        return;
      }
      img.addEventListener("load", onReady, { once: true });
      img.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
          fail(new Error("print-image: image failed to load"));
        },
        { once: true },
      );
    });

    // Build the print doc. `@page { margin: 0 }` and `body { margin: 0 }`
    // keep the printed page edge-to-edge; the image is constrained to the
    // page width with auto height so portrait/landscape both render right.
    iframe.srcdoc = `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(title)}</title>
    <meta charset="utf-8" />
    <style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      img {
        max-width: 100%;
        max-height: 100vh;
        height: auto;
        width: auto;
        display: block;
      }
    </style>
  </head>
  <body>
    <img src="${escapeAttr(imageUrl)}" alt="" />
  </body>
</html>`;

    document.body.appendChild(iframe);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
