/* AI Matrx form embed — popup and slider (lane TYPEFORM-DUP, 2026-10-07).
 *
 * <button data-matrx-form="https://www.aimatrx.com/f/<id>?embed=1" data-matrx-form-mode="popup">Open</button>
 * <script src="https://www.aimatrx.com/embed/form.js" async></script>
 *
 * A click opens the form's own page in an iframe — centred (popup) or as a side panel (slider).
 * It sets no cookie and reads none: the form keeps its place in its own storage and posts to its
 * own origin, so it works with third-party cookies blocked. Esc, the close button or a click on
 * the backdrop closes it. Nothing here touches the host page beyond the overlay it adds.
 */
(function () {
  if (window.__matrxFormEmbed) return;
  window.__matrxFormEmbed = true;

  function open(src, mode) {
    var slider = mode === "slider";
    var backdrop = document.createElement("div");
    backdrop.setAttribute("data-matrx-form-overlay", mode);
    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.45);display:flex;" +
      (slider ? "justify-content:flex-end;align-items:stretch;" : "justify-content:center;align-items:center;");
    var panel = document.createElement("div");
    panel.style.cssText = slider
      ? "position:relative;width:min(440px,100vw);height:100%;background:#fff;box-shadow:-8px 0 24px rgba(0,0,0,.2);"
      : "position:relative;width:min(720px,94vw);height:min(80vh,760px);background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.25);";
    var frame = document.createElement("iframe");
    frame.src = src;
    frame.title = "Form";
    frame.setAttribute("allow", "clipboard-write");
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.style.cssText =
      "position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:16px;border:0;background:rgba(0,0,0,.06);font:20px/32px system-ui;cursor:pointer;";
    function shut() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key === "Escape") shut();
    }
    close.addEventListener("click", shut);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) shut();
    });
    document.addEventListener("keydown", onKey);
    panel.appendChild(frame);
    panel.appendChild(close);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-matrx-form]") : null;
    if (!el) return;
    e.preventDefault();
    open(el.getAttribute("data-matrx-form"), el.getAttribute("data-matrx-form-mode") === "slider" ? "slider" : "popup");
  });
})();
