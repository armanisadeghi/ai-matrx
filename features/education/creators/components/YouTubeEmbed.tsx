// Server component. A responsive, privacy-friendly (youtube-nocookie) 16:9
// embed. Pure iframe — no client JS needed, fully server-rendered for SEO.
import { youTubeEmbedUrl } from "../youtube";
import { VideoPublishDate } from "@/features/files/blocks/video/VideoPublishDate";

export function YouTubeEmbed({
  videoId,
  title,
  publishedAt,
}: {
  videoId: string;
  title?: string | null;
  publishedAt?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={youTubeEmbedUrl(videoId)}
          title={title || "YouTube video"}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        <VideoPublishDate
          publishedAt={publishedAt}
          className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/75 px-1.5 py-0.5 text-white shadow-sm"
        />
      </div>
      {title ? (
        <p className="truncate px-3 py-2.5 text-sm font-medium text-foreground">
          {title}
        </p>
      ) : null}
    </div>
  );
}
