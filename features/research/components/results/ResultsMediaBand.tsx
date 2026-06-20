"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ImageIcon, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResearchMedia } from "../../types";

const MAX_IMAGES = 8;

/**
 * Section d (results of issue #14). Relevant images pulled from the topic,
 * largest first, as a lazy-loaded responsive strip. Clicking any image jumps
 * to the full Media tab. The whole section is skipped when there are no
 * images — never an empty box.
 */
export function ResultsMediaBand({
  media,
  topicId,
}: {
  media: ResearchMedia[];
  topicId: string;
}) {
  const images = useMemo(() => {
    return media
      .filter((m) => m.media_type === "image" && m.is_relevant !== false && !!m.url)
      .sort((a, b) => {
        const areaA = (a.width ?? 0) * (a.height ?? 0);
        const areaB = (b.width ?? 0) * (b.height ?? 0);
        return areaB - areaA;
      })
      .slice(0, MAX_IMAGES);
  }, [media]);

  if (images.length === 0) return null;

  const mediaHref = `/research/topics/${topicId}/media`;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-cyan-500" />
          <h2 className="text-lg font-semibold tracking-tight">Rich Media</h2>
          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            {images.length}
          </span>
        </div>
        <Link
          href={mediaHref}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 transition-colors hover:text-primary"
        >
          View all media
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {images.map((image, index) => (
          <MediaTile
            key={image.id}
            image={image}
            index={index}
            href={mediaHref}
          />
        ))}
      </div>
    </section>
  );
}

function MediaTile({
  image,
  index,
  href,
}: {
  image: ResearchMedia;
  index: number;
  href: string;
}) {
  const src = image.thumbnail_url || image.url;
  const label = image.alt_text || image.caption || "Research image";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ delay: (index % 4) * 0.04, duration: 0.4 }}
    >
      <Link
        href={href}
        className={cn(
          "group relative block aspect-video overflow-hidden rounded-xl border border-border/50 bg-muted/40",
          "transition-colors hover:border-border",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        {(image.caption || image.alt_text) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate px-2 py-1.5 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {image.caption || image.alt_text}
          </div>
        )}
      </Link>
    </motion.div>
  );
}
