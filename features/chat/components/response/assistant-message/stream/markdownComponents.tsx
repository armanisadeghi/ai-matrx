import StreamingCode from "@/features/chat/components/response/assistant-message/stream/StreamingCode";
import StreamingTable from "@/features/chat/components/response/assistant-message/stream/StreamingTable";
import { cn } from "@/styles/themes/utils";

const markdownComponents = {
  p: ({ children, ...props }: any) => (
    <p
      className="font-sans tracking-wide leading-relaxed text-md mb-2"
      {...props}
    >
      {children}
    </p>
  ),
  ul: ({ ...props }) => (
    <ul
      className="list-disc [&_ul]:list-[circle] [&_ul_ul]:list-dash pl-5 ml-3 mb-3 leading-relaxed text-md"
      {...props}
    />
  ),
  ol: ({ ...props }) => (
    <ol
      className="list-decimal [&_ol]:list-[lower-roman] [&_ol_ol]:list-[lower-alpha] pl-5 ml-3 mb-3 leading-relaxed text-md"
      {...props}
    />
  ),
  li: ({ children, ...props }: any) => (
    <li className="mb-1 text-md" {...props}>
      {children}
    </li>
  ),
  a: ({ node, ...props }) => (
    <a className="text-blue-500 underline font-medium text-md" {...props} />
  ),
  h1: ({ node, ...props }) => (
    <h1
      className="text-xl text-blue-500 font-bold mb-3 font-heading"
      {...props}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="text-xl text-blue-500 font-medium mb-2 font-heading"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      className="text-lg text-blue-500 font-medium mb-2 font-heading"
      {...props}
    />
  ),
  h4: ({ node, ...props }) => (
    <h4
      className="text-md text-blue-500 font-medium mb-1 font-heading"
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";

    if (!inline && language) {
      return (
        <StreamingCode
          code={String(children).replace(/\n$/, "")}
          language={language}
          fontSize={16}
          className="my-3"
        />
      );
    }

    return (
      <code
        className={cn(
          "px-1.5 py-0.5 rounded font-mono text-sm font-medium",
          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre className="my-3" {...props}>
      {children}
    </pre>
  ),
  // --- TABLE RENDERERS ---
  table: ({ children, ...props }) => (
    <StreamingTable {...props}>{children}</StreamingTable>
  ),
  thead: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
  th: ({ children, ...props }) => (
    <th
      className="px-4 py-2 text-left font-semibold text-bold text-gray-900 dark:text-gray-100"
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2" {...props}>
      {children}
    </td>
  ),
};

export default markdownComponents;
