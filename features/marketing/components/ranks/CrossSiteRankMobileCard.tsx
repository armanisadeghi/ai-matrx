import Link from "next/link";
import type { MatrxDataTableMobileCardControls } from "@/components/official/matrx-data-table/types";
import { formatCompactDate } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";
import type { CrossSiteRankRow } from "./cross-site-data";
import { movementText, positionText } from "./cross-site-columns";

interface CrossSiteRankMobileCardProps {
  row: CrossSiteRankRow;
  controls: MatrxDataTableMobileCardControls;
}

function rankHref(row: CrossSiteRankRow): string | undefined {
  return row.site_id
    ? marketingRoutes.site(row.brand_id, row.site_id, "/ranks")
    : undefined;
}

/** Phone summary for the canonical cross-site rank table's loaded row. */
export function CrossSiteRankMobileCard({
  row,
  controls,
}: CrossSiteRankMobileCardProps) {
  const href = rankHref(row);
  const keyword = (
    <span className="line-clamp-2 break-words [overflow-wrap:anywhere]">
      {row.keyword}
    </span>
  );

  return (
    <article
      aria-label={`Rank target ${row.keyword}`}
      className="shrink-0 rounded-lg border border-border/80 bg-card p-3 shadow-sm"
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="inline-flex min-h-11 w-full items-start rounded-md py-1 text-sm font-semibold text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {keyword}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-foreground">{keyword}</p>
          )}
          {row.keyword.length > 48 ? (
            <details className="group mt-1 text-xs text-muted-foreground">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-md pr-3 font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                <span className="group-open:hidden">Show full keyword</span>
                <span className="hidden group-open:inline">
                  Hide full keyword
                </span>
              </summary>
              <p className="rounded-md bg-muted/50 p-2 text-xs text-foreground [overflow-wrap:anywhere]">
                {row.keyword}
              </p>
            </details>
          ) : null}
        </div>
        <div className="flex min-h-11 shrink-0 items-center">
          {controls.actions}
        </div>
      </header>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/60 py-3">
        <div className="col-span-2">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Site
          </dt>
          <dd className="mt-0.5 text-sm font-medium text-foreground">
            {row.site_name ?? "Site unavailable"}
          </dd>
          {row.site_domain ? (
            <dd className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {row.site_domain}
            </dd>
          ) : null}
        </div>
        <RankDatum label="Position" value={positionText(row)} />
        <RankDatum
          label="Change"
          value={movementText(row)}
          valueClassName={
            row.movement == null || row.movement === 0
              ? "text-muted-foreground"
              : row.movement > 0
                ? "text-success"
                : "text-destructive"
          }
        />
        <RankDatum
          label="Best"
          value={row.best_position == null ? "—" : `#${row.best_position}`}
        />
        <RankDatum
          label="Last checked"
          value={
            row.last_checked_at
              ? formatCompactDate(row.last_checked_at)
              : "Never"
          }
        />
        <RankDatum label="Tracked in" value={row.tracking_label || "Unknown"} />
        <RankDatum label="Device" value={row.device || "Unknown"} />
      </dl>

      <footer className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {row.is_active ? "Active tracking" : "Inactive tracking"}
        </span>
        {href ? (
          <Link
            href={href}
            className="inline-flex min-h-11 items-center rounded-md px-3 text-xs font-medium text-primary outline-none hover:bg-accent hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open ranks
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

function RankDatum({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}
