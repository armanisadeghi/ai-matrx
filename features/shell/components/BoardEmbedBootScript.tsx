// Inline <script> that runs before first paint: an app page framed by the app
// itself (a page placed on a /board as a tile — features/spatial/items/
// page-items.tsx) marks <html data-board-embed>, and styles/shell.css §13d
// drops the shell's sidebar, header, rail and dock so the page fills its tile.
// Before paint, so the chrome never flashes. A page framed by another origin is
// left alone (reading window.top.location throws cross-origin).

import Script from "next/script";

const SCRIPT = `(function(){try{if(window.self!==window.top&&window.top.location.origin===window.location.origin){document.documentElement.setAttribute("data-board-embed","")}}catch(e){}})();`;

export function BoardEmbedBootScript() {
  return (
    <Script
      id="matrx-board-embed"
      strategy="beforeInteractive"
      // A static, vetted string with no interpolation.
      dangerouslySetInnerHTML={{ __html: SCRIPT }}
    />
  );
}
