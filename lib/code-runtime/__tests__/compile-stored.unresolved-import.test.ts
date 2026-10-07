/**
 * THE UNRESOLVED-IMPORT RULE (Law 4, 2026-10-01).
 *
 * A stored tool display / applet slot that imports something the sandbox
 * cannot supply must (a) SHOW the gap where it renders — a marked stand-in
 * naming the missing import, with wrapped content still rendered — and
 * (b) land in the error queue with the import path and the stored component
 * it came from. Before this rule the code only console.warned and rendered a
 * neutral question-mark icon that dropped its children; nothing was captured.
 *
 * Imports go through the `@/` alias on purpose so the red proof can map the
 * three compile modules to their pre-fix bytes (see the commit message).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileStoredComponent } from "@/lib/code-runtime/compile-stored";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { resetUnresolvedImportCaptures } from "@/lib/diagnostics/captureUnresolvedImports";

function render(Component: unknown): string {
  if (typeof Component !== "function" && typeof Component !== "object") {
    throw new Error("Expected the stored component to compile");
  }
  return renderToStaticMarkup(
    createElement(Component as React.ComponentType, {}),
  );
}

function unresolvedCaptures() {
  return getSnapshot().filter((e) => e.source === "sandbox-unresolved-import");
}

/** Captures are deferred out of render to a macrotask; let it run. */
function flushCaptures(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  clearCapturedErrors();
  resetUnresolvedImportCaptures();
});

describe("compileStoredComponent — unresolved imports announce themselves", () => {
  it("shows a named stand-in that keeps its children and files the import path under the tool", async () => {
    const result = compileStoredComponent({
      origin: "tool:get_weather",
      code: `
        import { ForecastCard } from "@/features/weather/ForecastCard";

        export default function WeatherDisplay() {
          return (
            <section>
              <ForecastCard>Irvine, 72°F and sunny</ForecastCard>
            </section>
          );
        }
      `,
      allowedImports: ["react"],
    });

    expect(result.error).toBeNull();
    const markup = render(result.Component);
    expect(markup).toContain('data-unresolved-import="ForecastCard"');
    expect(markup).toContain(
      'data-import-path="@/features/weather/ForecastCard"',
    );
    // The chip carries the name as visible text, not only an attribute.
    expect(markup).toMatch(/>ForecastCard<\/span>/);
    // Wrapped content is not swallowed by the stand-in.
    expect(markup).toContain("Irvine, 72°F and sunny");

    await flushCaptures();
    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("tool:get_weather");
    expect(captures[0].message).toContain("ForecastCard");
    expect(captures[0].message).toContain("@/features/weather/ForecastCard");
  });

  it("files an icon the allowlisted module does not export", async () => {
    const result = compileStoredComponent({
      origin: "applet:3f1c2a9e:slot:header",
      code: `
        import { CloudSunRainbow } from "lucide-react";
        export default function Header() {
          return <h2><CloudSunRainbow /> Weekend forecast</h2>;
        }
      `,
      allowedImports: ["react", "lucide-react"],
    });

    const markup = render(result.Component);
    expect(markup).toContain('data-unresolved-import="CloudSunRainbow"');
    expect(markup).toContain("Weekend forecast");
    await flushCaptures();
    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("applet:3f1c2a9e:slot:header");
    expect(captures[0].message).toContain('"lucide-react"');
  });

  it("files a JSX tag that is never imported or defined", async () => {
    const result = compileStoredComponent({
      origin: "emit:report_summary",
      code: `
        export default function Summary() {
          return <div><StatusPill /> Report ready</div>;
        }
      `,
      allowedImports: ["react"],
    });

    expect(render(result.Component)).toContain(
      'data-unresolved-import="StatusPill"',
    );
    await flushCaptures();
    expect(unresolvedCaptures().map((c) => c.relation)).toEqual([
      "emit:report_summary",
    ]);
  });

  it("files an allowed_imports entry the allowlist does not know", async () => {
    compileStoredComponent({
      origin: "tool:search_listings",
      code: `export default function Listings() { return <ul />; }`,
      allowedImports: ["react", "@/features/listings/private-client"],
    });

    await flushCaptures();
    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("tool:search_listings");
    expect(captures[0].message).toContain("@/features/listings/private-client");
  });

  it("files nothing for a component whose imports all resolve", async () => {
    const result = compileStoredComponent({
      origin: "tool:get_weather",
      code: `
        import { Sun } from "lucide-react";
        import { Badge as Pill } from "@/components/ui/badge";
        export default function Ok() {
          return <div><Sun /><Pill>Clear</Pill></div>;
        }
      `,
      allowedImports: ["react", "lucide-react", "@/components/ui/badge"],
    });

    const markup = render(result.Component);
    expect(markup).not.toContain("data-unresolved-import");
    expect(markup).toContain("Clear");
    await flushCaptures();
    expect(unresolvedCaptures()).toHaveLength(0);
  });
});

/**
 * Several hosts compile in a per-mount `useMemo` (public renderer, template
 * preview, slot renderer, custom shell): every re-mount re-runs the compile,
 * and the compile runs INSIDE render. The gap is filed once per page session,
 * and never from inside the compile call itself.
 */
describe("compileStoredComponent — unresolved-import filing is once and out of render", () => {
  const HEADER = `
    import { RainChance } from "@/features/weather/RainChance";
    export default function Header() {
      return <h2><RainChance /> Saturday in Irvine</h2>;
    }
  `;

  it("files nothing synchronously inside the compile (it runs during render)", async () => {
    compileStoredComponent({
      origin: "applet:7b2e41d0:slot:header",
      code: HEADER,
      allowedImports: ["react"],
    });
    expect(unresolvedCaptures()).toHaveLength(0);

    await flushCaptures();
    expect(unresolvedCaptures()).toHaveLength(1);
  });

  it("re-mounting the same slot does not raise the count or the unseen badge", async () => {
    for (let mount = 0; mount < 4; mount++) {
      compileStoredComponent({
        origin: "applet:7b2e41d0:slot:header",
        code: HEADER,
        allowedImports: ["react"],
      });
    }
    await flushCaptures();

    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].count).toBe(1);
    expect(captures[0].relation).toBe("applet:7b2e41d0:slot:header");
  });

  it("still files the same import separately for a different stored component", async () => {
    for (const origin of [
      "applet:7b2e41d0:slot:header",
      "applet:c09a5f13:slot:header",
    ]) {
      compileStoredComponent({ origin, code: HEADER, allowedImports: ["react"] });
    }
    await flushCaptures();

    expect(unresolvedCaptures().map((c) => c.relation).sort()).toEqual([
      "applet:7b2e41d0:slot:header",
      "applet:c09a5f13:slot:header",
    ]);
  });
});
