"use client";
import { usePageSandbox } from "@/lib/iframe/use-page-sandbox";
import type { embedTarget } from "./embed-providers";

/** Third-party scripts in srcDoc run in an opaque origin, including GitHub Gists. */
export function SpaceEmbedFrame({
  target,
  title,
}: {
  target: NonNullable<ReturnType<typeof embedTarget>>;
  title: string;
}) {
  const sandbox = usePageSandbox(
    target.srcDoc ? null : (target.src ?? null),
    "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation",
  );
  return (
    <iframe
      key={sandbox}
      className="spaces-iframe spaces-iframe-embed"
      data-provider={target.provider}
      src={target.src}
      srcDoc={target.srcDoc}
      title={title}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      sandbox={sandbox}
    />
  );
}
