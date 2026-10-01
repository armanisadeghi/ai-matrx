/**
 * THE UNRESOLVED-IMPORT RULE (Law 4, 2026-10-01).
 *
 * A stored tool display / agent-app slot that imports something the sandbox
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
import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

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

beforeEach(() => clearCapturedErrors());

describe("compileSlotComponent — unresolved imports announce themselves", () => {
  it("shows a named stand-in that keeps its children and files the import path under the tool", () => {
    const result = compileSlotComponent({
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

    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("tool:get_weather");
    expect(captures[0].message).toContain("ForecastCard");
    expect(captures[0].message).toContain("@/features/weather/ForecastCard");
  });

  it("files an icon the allowlisted module does not export", () => {
    const result = compileSlotComponent({
      origin: "agent-app:3f1c2a9e:slot:header",
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
    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("agent-app:3f1c2a9e:slot:header");
    expect(captures[0].message).toContain('"lucide-react"');
  });

  it("files a JSX tag that is never imported or defined", () => {
    const result = compileSlotComponent({
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
    expect(unresolvedCaptures().map((c) => c.relation)).toEqual([
      "emit:report_summary",
    ]);
  });

  it("files an allowed_imports entry the allowlist does not know", () => {
    compileSlotComponent({
      origin: "tool:search_listings",
      code: `export default function Listings() { return <ul />; }`,
      allowedImports: ["react", "@/features/listings/private-client"],
    });

    const captures = unresolvedCaptures();
    expect(captures).toHaveLength(1);
    expect(captures[0].relation).toBe("tool:search_listings");
    expect(captures[0].message).toContain("@/features/listings/private-client");
  });

  it("files nothing for a component whose imports all resolve", () => {
    const result = compileSlotComponent({
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
    expect(unresolvedCaptures()).toHaveLength(0);
  });
});
