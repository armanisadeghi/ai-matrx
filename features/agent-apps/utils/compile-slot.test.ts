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
});
