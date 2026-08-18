import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileSlotComponent } from "./compile-slot";

describe("compileSlotComponent", () => {
  it("removes multiline allowlisted imports before evaluating sandbox code", () => {
    const result = compileSlotComponent({
      code: `
        import { useState } from "react";
        import {
          ChevronDown,
          ChevronUp,
        } from "lucide-react";

        export default function EmployeeCard({ data }: { data: { name?: string } }) {
          const [open] = useState(false);
          const Icon = open ? ChevronUp : ChevronDown;
          return <div><Icon />{data.name}</div>;
        }
      `,
      allowedImports: ["react", "lucide-react"],
    });

    expect(result.error).toBeNull();
    expect(typeof result.Component).toBe("function");
  });

  it("removes type-only and side-effect imports without rewriting strings", () => {
    const result = compileSlotComponent({
      code: `
        import type { ReactNode } from "react";
        import "sandbox-theme";

        export default function ImportText() {
          const text = 'import { Example } from "docs";';
          return <div>{text}</div>;
        }
      `,
      allowedImports: [],
    });

    expect(result.error).toBeNull();
    expect(typeof result.Component).toBe("function");
  });

  // Regression: an author-declared top-level component that is also used as a
  // JSX tag used to collide with the auto-injected fallback scope parameter,
  // producing "Identifier 'IconBase' has already been declared". The author's
  // own declaration must simply shadow the injected scope.
  it("does not collide when the author declares a component used as a JSX tag (const arrow)", () => {
    const result = compileSlotComponent({
      code: `
        const IconBase = ({ label }: { label: string }) => <span>{label}</span>;

        export default function Card() {
          return <div><IconBase label="hi" /></div>;
        }
      `,
      allowedImports: ["react", "lucide-react"],
    });

    expect(result.error).toBeNull();
    expect(typeof result.Component).toBe("function");
  });

  it("does not collide when the author declares a class component used as a JSX tag", () => {
    const result = compileSlotComponent({
      code: `
        class Panel extends (globalThis as any).Object {
          render() { return null; }
        }
        const Widget = () => <span>w</span>;
        export default function Root() {
          return <div><Widget /></div>;
        }
      `,
      allowedImports: ["react"],
    });

    expect(result.error).toBeNull();
    expect(typeof result.Component).toBe("function");
  });

  // Regression: an author-declared top-level `const` that shadows an ALLOWLISTED
  // export (here `Button`) used to collide with the injected scope parameter of
  // the same name. The author's declaration must win.
  it("does not collide when the author redeclares an allowlisted identifier", () => {
    const result = compileSlotComponent({
      code: `
        const Button = ({ children }: { children?: unknown }) => <button>{children as any}</button>;

        export default function Toolbar() {
          return <div><Button>Save</Button></div>;
        }
      `,
      allowedImports: ["react", "@/components/ui/button"],
    });

    expect(result.error).toBeNull();
    expect(typeof result.Component).toBe("function");
  });

  it("lets the host replace an allowlisted runtime primitive", () => {
    const HostMarkdownStream = () =>
      createElement("span", { "data-host-stream": "true" });
    const result = compileSlotComponent({
      code: `
        import MarkdownStream from "@/components/MarkdownStream";
        export default function Result() {
          return <MarkdownStream content="live" />;
        }
      `,
      allowedImports: ["react", "@/components/MarkdownStream"],
      scopeOverrides: { MarkdownStream: HostMarkdownStream },
    });

    expect(result.error).toBeNull();
    const Component = result.Component;
    if (!Component) throw new Error("Expected the slot component to compile");
    const markup = renderToStaticMarkup(createElement(Component, {}));
    expect(markup).toContain('data-host-stream="true"');
  });

  // The kind-component authoring contract (matrx-ai `component_source_lint`)
  // documents a BARE top-level `function Card({ data }) {…}` — no default
  // export — and the Workflow Studio's compiler (a port of this one) accepts
  // it. This compiler must too: without the fallback such a source compiled
  // to a factory returning nothing, the caller reported "compile produced no
  // component", and a stored, paid-for component silently never rendered.
  it("resolves a bare top-level PascalCase component with no default export", () => {
    const result = compileSlotComponent({
      code: `
        function Card({ data }) {
          return <div data-bare="true">{data?.title}</div>;
        }
      `,
      allowedImports: ["react"],
    });

    expect(result.error).toBeNull();
    const Component = result.Component;
    if (!Component) throw new Error("Expected the bare component to compile");
    const markup = renderToStaticMarkup(
      createElement(Component, { data: { title: "hello" } }),
    );
    expect(markup).toContain('data-bare="true"');
    expect(markup).toContain("hello");
  });

  it("prefers an explicit default export over a PascalCase candidate", () => {
    const result = compileSlotComponent({
      code: `
        function Helper() { return <span data-helper="true" />; }
        export default function Main() { return <div data-main="true" />; }
      `,
      allowedImports: ["react"],
    });

    expect(result.error).toBeNull();
    const Component = result.Component;
    if (!Component) throw new Error("Expected the component to compile");
    const markup = renderToStaticMarkup(createElement(Component, {}));
    expect(markup).toContain('data-main="true"');
  });
});
