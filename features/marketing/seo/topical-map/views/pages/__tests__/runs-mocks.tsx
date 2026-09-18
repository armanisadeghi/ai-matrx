// features/marketing/seo/topical-map/views/pages/__tests__/runs-mocks.tsx
//
// The UI-library boundary the `runs-*` suites stand a screen on. NOT a suite —
// `testMatch` only collects `*.(test|spec).[jt]s?(x)`.
//
// 🚨 WHAT THIS DOES AND DOES NOT REPLACE. Every export here is a component
// library primitive with no logic of ours in it: Radix's Popover mounts its
// content through a portal only after a real pointer interaction, which jsdom
// does not have, and `@ai-matrx/design-system` is the single module every one of
// this repo's `components/ui/*` doors re-exports from — so one mock covers
// Button, Switch, Checkbox and Input as well. Nothing our lane wrote is mocked
// here: the consequence sentences, the ordering rules and the bodies that reach
// `run()` are all the real thing.
//
// The switch and checkbox stand-ins carry the real ARIA contract
// (`role="switch"` / `role="checkbox"` + `aria-checked`) and fire
// `onCheckedChange` on click, so a suite asserts against the same affordance a
// person uses.

import * as React from "react";

type Children = { children?: React.ReactNode };

export function designSystemMock() {
  const Passthrough = ({ children }: Children) =>
    React.createElement("div", null, children);

  const Button = React.forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement> & {
      size?: string;
      variant?: string;
      asChild?: boolean;
    }
  >(({ size: _size, variant: _variant, asChild: _asChild, ...props }, ref) =>
    React.createElement("button", { ...props, ref }),
  );
  Button.displayName = "Button";

  const Input = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
  >((props, ref) => React.createElement("input", { ...props, ref }));
  Input.displayName = "Input";

  const toggle = (role: "switch" | "checkbox") => {
    const Toggle = React.forwardRef<
      HTMLButtonElement,
      {
        id?: string;
        checked?: boolean;
        onCheckedChange?: (next: boolean) => void;
        className?: string;
        size?: string;
      }
    >(({ id, checked, onCheckedChange, className }, ref) =>
      React.createElement("button", {
        ref,
        id,
        type: "button",
        role,
        className,
        "aria-checked": checked === true,
        onClick: () => onCheckedChange?.(!checked),
      }),
    );
    Toggle.displayName = role;
    return Toggle;
  };

  return {
    Popover: Passthrough,
    PopoverTrigger: Passthrough,
    PopoverContent: Passthrough,
    Button,
    buttonVariants: () => "",
    Input,
    Switch: toggle("switch"),
    Checkbox: toggle("checkbox"),
  };
}

/**
 * The door primitive, stood in for by the name it would open. The DOOR LAW is
 * enforced by `EntityRef` itself and by `pnpm check:dead-ends`, not by these
 * suites — mounting the real one here would drag the entity registry, the peek
 * registry and `AppLink` into a test about whether a Start button exists.
 */
export function entityRefMock() {
  return {
    EntityRef: ({ token, id }: { token: string; id: string }) =>
      React.createElement("span", { "data-entity-ref": token }, id),
  };
}
