"use client";

export function CodeEditorWindowBody() {
  return (
    <div className="p-4 font-mono text-sm text-green-400 bg-zinc-950 h-full">
      <div className="text-zinc-500 mb-2">{"// main.ts"}</div>
      <div>
        <span className="text-purple-400">function</span>{" "}
        <span className="text-yellow-300">greet</span>
        {"("}
        <span className="text-orange-300">name</span>
        {": "}
        <span className="text-blue-300">string</span>
        {")"} {"{"}
      </div>
      <div className="pl-4">
        <span className="text-purple-400">return</span> {"`Hello, ${name}!`"}
      </div>
      <div>{"}"}</div>
      <div className="mt-3 text-zinc-500">{"// Output"}</div>
      <div className="mt-1">
        <span className="text-green-500">console</span>.log(greet(
        <span className="text-yellow-300">"World"</span>))
      </div>
      <div className="mt-4 text-zinc-600">
        {"// >"} <span className="text-white">Hello, World!</span>
      </div>
    </div>
  );
}
