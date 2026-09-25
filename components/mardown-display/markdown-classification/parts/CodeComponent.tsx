"use client";

import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";
import { ShikiCodeView } from "@/features/code-editor/components/code-block/highlight/ShikiCodeView";

// react-markdown v10 passes JSX.IntrinsicElements['code'] & ExtraProps to the
// `code` component override — there is no `inline` prop (removed upstream);
// code vs inline-code is distinguished by the presence of a `language-*`
// className on the node, which the `match` check below already handles.
type CodeProps = ComponentPropsWithoutRef<"code"> &
  ExtraProps & {
    mode: "dark" | "light";
  };

export const CodeComponent = ({
  mode,
  node: _node,
  className,
  children,
  ...props
}: CodeProps) => {
  const match = /language-(\w+)/.exec(className || "");
  // DATA CONTRACT: code renders verbatim — never strip the trailing newline
  // (round-tripping an edit would silently lose it).
  const codeString = String(children);
  return match ? (
    <div className="my-4 overflow-hidden rounded-md">
      <ShikiCodeView
        code={codeString}
        language={match[1]}
        mode={mode}
        showLineNumbers
      />
    </div>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

export default CodeComponent;
