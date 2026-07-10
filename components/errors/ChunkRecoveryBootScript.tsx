// Inline <script> that runs before React hydrates. Last line of defense for
// stale tabs after a Vercel deploy: if a chunk request 404s during the INITIAL
// page load — before any React error boundary mounts — this listener catches
// the global error event and reloads the page. At that moment nothing the user
// typed exists yet, so a reload is lossless.
//
// CRITICAL: once React boots (NewVersionWatcher sets __MATRX_APP_BOOTED__),
// this script must NEVER reload — a mid-session reload destroys unsaved work
// (this exact bug once wiped a user's page while they opened a context menu).
// Post-boot it only dispatches the "matrx:stale-chunk" event; NewVersionWatcher
// turns that into a consent-based "Refresh / Not now" toast.
//
// Why inline / pre-hydration: ChunkLoadError can fire during the very first
// chunk fetch, which means React itself hasn't mounted yet, so no `error.tsx`
// or `global-error.tsx` boundary exists to catch it. The browser's `error`
// event is the only hook available at that moment.
//
// This script is intentionally tiny and dependency-free — it must never
// itself depend on a chunk. Keep the flag/event names in sync with
// chunk-load-recovery.ts (APP_BOOTED_FLAG / STALE_CHUNK_EVENT).

const SCRIPT = `(function(){
  try {
    var KEY = "chunk-load-recovery:last-reload";
    var GUARD_MS = 30000;
    function isChunkErr(msg) {
      if (!msg) return false;
      msg = String(msg);
      return /ChunkLoadError/i.test(msg)
        || /Loading chunk [\\w-]+ failed/i.test(msg)
        || /Failed to load chunk/i.test(msg)
        || /Failed to fetch dynamically imported module/i.test(msg)
        || /Importing a module script failed/i.test(msg);
    }
    function onChunkErr(msg) {
      if (!isChunkErr(msg)) return;
      if (window.__MATRX_APP_BOOTED__) {
        // App is live — the user may have unsaved work. NEVER reload here.
        try {
          window.dispatchEvent(new CustomEvent("matrx:stale-chunk", {
            detail: { message: String(msg) }
          }));
        } catch (e) {}
        return;
      }
      // Pre-hydration: nothing rendered yet, reload is lossless. Loop-guarded
      // so a genuinely broken new build doesn't trap the user in reloads.
      try {
        var last = Number(sessionStorage.getItem(KEY) || 0);
        var now = Date.now();
        if (last && now - last < GUARD_MS) return;
        sessionStorage.setItem(KEY, String(now));
      } catch (e) { /* private mode etc. — fall through */ }
      location.reload();
    }
    window.addEventListener("error", function(ev) {
      var msg = ev && (ev.message || (ev.error && ev.error.message));
      var name = ev && ev.error && ev.error.name;
      onChunkErr(name === "ChunkLoadError" ? name : msg);
    });
    window.addEventListener("unhandledrejection", function(ev) {
      var r = ev && ev.reason;
      if (!r) return;
      var msg = typeof r === "string" ? r : (r.message || "");
      var name = r && r.name;
      onChunkErr(name === "ChunkLoadError" ? name : msg);
    });
  } catch (e) { /* never break the page */ }
})();`;

export function ChunkRecoveryBootScript() {
  return (
    <script
      // Runs synchronously before any chunked JS so we catch errors from the
      // very first chunk fetch. dangerouslySetInnerHTML is intentional: this
      // is a static, vetted string with no user-controlled interpolation.
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
