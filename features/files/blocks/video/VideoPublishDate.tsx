import { cn } from "@/lib/utils";
import {
  formatVideoPublishDate,
  formatVideoPublishDateTitle,
} from "@/lib/media/video-date";

/** One compact publish-date treatment shared by every video surface. */
export function VideoPublishDate({
  publishedAt,
  className,
}: {
  publishedAt?: string | null;
  className?: string;
}) {
  const dateTime =
    publishedAt && !Number.isNaN(new Date(publishedAt).getTime())
      ? publishedAt
      : undefined;
  const content = formatVideoPublishDate(publishedAt);
  const sharedProps = {
    className: cn(
      "shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground",
      className,
    ),
    title: formatVideoPublishDateTitle(publishedAt),
    "aria-label": formatVideoPublishDateTitle(publishedAt),
  };

  return dateTime ? (
    <time {...sharedProps} dateTime={dateTime}>
      {content}
    </time>
  ) : (
    <span {...sharedProps}>{content}</span>
  );
}
