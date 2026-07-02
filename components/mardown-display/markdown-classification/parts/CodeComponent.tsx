"use client";

import dynamic from "next/dynamic";
import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";
import { dracula, prism } from "react-syntax-highlighter/dist/cjs/styles/prism";

// Import SyntaxHighlighter properly
const SyntaxHighlighter = dynamic(
    () => import("react-syntax-highlighter").then((mod) => mod.Prism),
    { ssr: false }
  );

// react-markdown v10 passes JSX.IntrinsicElements['code'] & ExtraProps to the
// `code` component override — there is no `inline` prop (removed upstream);
// code vs inline-code is distinguished by the presence of a `language-*`
// className on the node, which the `match` check below already handles.
type CodeProps = ComponentPropsWithoutRef<"code"> &
    ExtraProps & {
        mode: "dark" | "light";
    };

// Define code rendering component with proper typing
export const CodeComponent = ({ mode, node, className, children, ...props }: CodeProps) => {
    const match = /language-(\w+)/.exec(className || "");
    // DATA CONTRACT: code renders verbatim. Previously we stripped the
    // trailing newline via `.replace(/\n$/, "")`, which breaks the "never
    // mutate content" contract — round-tripping an edit would silently
    // lose the final newline.
    const codeString = String(children);
    return match ? (
        <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            {/* We need to render this conditionally to avoid type errors with the dynamic import */}
            {mode === "dark" ? (
                <div className="rounded-md overflow-hidden">
                    {/* @ts-ignore - TypeScript doesn't properly handle dynamic components */}
                    <SyntaxHighlighter language={match[1]} style={dracula} PreTag="div" showLineNumbers useInlineStyles>
                        {codeString}
                    </SyntaxHighlighter>
                </div>
            ) : (
                <div className="rounded-md overflow-hidden">
                    {/* @ts-ignore - TypeScript doesn't properly handle dynamic components */}
                    <SyntaxHighlighter language={match[1]} style={prism} PreTag="div" showLineNumbers useInlineStyles>
                        {codeString}
                    </SyntaxHighlighter>
                </div>
            )}
        </div>
    ) : (
        <code className={className} {...props}>
            {children}
        </code>
    );
};

export default CodeComponent;