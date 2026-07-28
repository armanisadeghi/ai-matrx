"use client";

import { useState } from "react";
import {
  Braces,
  ExternalLink,
  FileCode2,
  ImageIcon,
  ImageOff,
  Link2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CondensedFieldGrid,
  formatDate,
  JsonPreview,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import {
  parseSnapshotImages,
  parseSnapshotPageIdentity,
  parseSnapshotResources,
  parseSnapshotStructuredData,
  type ParsedSnapshotResource,
} from "@/features/marketing/lib/snapshot-content";
import type { MarketingPage, PageSnapshot } from "@/features/marketing/types";
import { isJsonRecord } from "@/features/marketing/types";
import { formatText } from "@/utils/text/text-case-converter";
import type { Json } from "@/types/database.types";

function primaryBlockLabel(data: Record<string, Json>): string | null {
  for (const key of ["name", "headline", "title", "url", "@id"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resourceFileName(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split("/").filter(Boolean).at(-1) || parsed.hostname;
  } catch {
    return url;
  }
}

function FeaturedImage({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex aspect-[16/9] min-h-32 items-center justify-center gap-2 rounded-md bg-muted/40 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4" />
        {src ? "Featured image failed to load" : "No featured image detected"}
      </div>
    );
  }
  return (
    // This is the observed public page URL, not owned file storage.
    <img
      src={src}
      alt={alt}
      className="aspect-[16/9] min-h-32 w-full rounded-md bg-muted/40 object-cover"
      onError={() => setBroken(true)}
    />
  );
}

function RawEvidence({ value }: { value: Json }) {
  return (
    <details className="border-t border-border">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <Braces className="h-3.5 w-3.5" />
        Raw captured data
      </summary>
      <JsonPreview value={value} />
    </details>
  );
}

export function PageIdentityCard({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const identity = parseSnapshotPageIdentity(
    snapshot.extracted,
    snapshot.structured_data,
  );
  const head = parseSnapshotHeadTags(snapshot.head_tags);
  const featuredImage =
    identity.featuredImage ?? head.og.image ?? head.twitter.image;
  const payload = {
    url: page.url,
    featured_image: featuredImage,
    ...identity,
  };
  const rawIdentity = isJsonRecord(snapshot.extracted)
    ? (snapshot.extracted.page_identity ?? {})
    : {};
  const platformTemplate =
    typeof identity.platformDetails.template === "string"
      ? identity.platformDetails.template
      : null;
  const platformContentId =
    typeof identity.platformDetails.wordpress_post_id === "string"
      ? identity.platformDetails.wordpress_post_id
      : null;
  return (
    <SectionCard
      title="Page identity"
      className="lg:col-span-2"
      anchor="page_identity"
      copy={{
        ...webCopy({
          kind: "web-page-identity",
          label: "Page identity",
          description:
            "Observed page-identifying signals: featured image, CMS/generator, type, authorship, and publication dates.",
          surface: `Page identity — ${page.url}`,
          data: payload,
          lines: [
            ["URL", page.url],
            ["CMS", identity.cms],
            ["Generator", identity.generator],
            ["Page type", identity.pageTypes.join(", ")],
            ["Author", identity.author],
            ["Published", identity.publishedAt],
            ["Modified", identity.modifiedAt],
            ["Featured image", featuredImage],
          ],
          attributes: { page_id: page.id, snapshot_id: snapshot.id },
        }),
        json: () => payload,
      }}
    >
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <FeaturedImage
            src={featuredImage}
            alt={head.title ?? page.path ?? "Featured page image"}
          />
          {featuredImage ? (
            <a
              href={featuredImage}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{featuredImage}</span>
            </a>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {identity.cms ? (
              <Badge variant="secondary">{formatText(identity.cms)}</Badge>
            ) : null}
            {identity.pageTypes.map((type) => (
              <Badge key={type} variant="outline">
                {type}
              </Badge>
            ))}
            {identity.platformSignals.map((signal) => (
              <Badge key={signal} variant="outline">
                {formatText(signal)}
              </Badge>
            ))}
            {identity.featuredImageSource ? (
              <Badge variant="outline">
                Image: {identity.featuredImageSource}
              </Badge>
            ) : null}
          </div>
          <CondensedFieldGrid
            fields={[
              { label: "Generator", value: identity.generator ?? "—" },
              {
                label: "Application",
                value: identity.applicationName ?? identity.siteName ?? "—",
              },
              {
                label: "Locale",
                value: identity.locale ?? identity.htmlLang ?? "—",
              },
              { label: "Author", value: identity.author ?? "—" },
              {
                label: "Published",
                value: formatDate(identity.publishedAt),
              },
              {
                label: "Modified",
                value: formatDate(identity.modifiedAt),
              },
              {
                label: "Content section",
                value: identity.contentSection ?? "—",
              },
              { label: "CMS content id", value: platformContentId ?? "—" },
              { label: "Template", value: platformTemplate ?? "—" },
              { label: "Theme color", value: identity.themeColor ?? "—" },
            ]}
          />
          {identity.shortlink || identity.ampUrl || identity.apiUrls.length ? (
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
              {identity.shortlink ? (
                <a
                  href={identity.shortlink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  Shortlink
                </a>
              ) : null}
              {identity.ampUrl ? (
                <a
                  href={identity.ampUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  AMP version
                </a>
              ) : null}
              {identity.apiUrls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  API
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <RawEvidence value={rawIdentity} />
    </SectionCard>
  );
}

export function StructuredDataCard({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const structured = parseSnapshotStructuredData(snapshot.structured_data);
  return (
    <SectionCard
      title="Structured data"
      collapsible
      anchor="structured_data"
      copy={{
        ...webCopy({
          kind: "web-page-structured-data",
          label: "Structured data",
          description:
            "Every captured JSON-LD, microdata, RDFa, and microformat payload plus its normalized entity blocks.",
          surface: `Structured data — ${page.url}`,
          data: snapshot.structured_data,
          lines: [
            ["URL", page.url],
            ["Schema types", structured.schemaTypes.join(", ")],
            ["JSON-LD scripts", structured.jsonLdRaw.length],
            ["Parsed JSON-LD documents", structured.jsonLd.length],
            ["Entity blocks", structured.blocks.length],
            ["Microdata items", structured.microdata.length],
            ["RDFa items", structured.rdfa.length],
            ["Microformat items", structured.microformats.length],
            ["Parse errors", structured.parseErrors.length],
          ],
          attributes: { page_id: page.id, snapshot_id: snapshot.id },
        }),
        json: () => snapshot.structured_data,
      }}
    >
      <div className="p-3">
        {!structured.hasPayload ? (
          <p className="text-xs text-muted-foreground">
            No structured data was detected in this snapshot.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {structured.schemaTypes.map((type) => (
                <Badge key={type} variant="secondary">
                  {type}
                </Badge>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                [
                  "JSON-LD",
                  structured.jsonLdRaw.length || structured.jsonLd.length,
                ],
                ["Entities", structured.blocks.length],
                ["Microdata", structured.microdata.length],
                ["RDFa", structured.rdfa.length],
                ["Microformats", structured.microformats.length],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2"
                >
                  <p className="text-[10px] uppercase text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {structured.blocks.length > 0 ? (
              <div className="mt-3 max-h-80 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/70">
                {structured.blocks.map((block, index) => (
                  <details
                    key={`${block.source}-${index}`}
                    className="group/entity"
                  >
                    <summary className="flex min-w-0 cursor-pointer list-none items-start gap-2 px-2.5 py-2">
                      <FileCode2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="h-5 text-[9px]">
                            {block.source}
                          </Badge>
                          {block.types.map((type) => (
                            <Badge
                              key={`${index}-${type}`}
                              variant="secondary"
                              className="h-5 text-[9px]"
                            >
                              {type}
                            </Badge>
                          ))}
                          {block.types.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              Untyped entity
                            </span>
                          ) : null}
                        </div>
                        {primaryBlockLabel(block.data) ? (
                          <p
                            className="mt-1 truncate text-xs font-medium"
                            title={primaryBlockLabel(block.data) ?? undefined}
                          >
                            {primaryBlockLabel(block.data)}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {Object.keys(block.data).length} properties · click to
                          inspect
                        </p>
                      </div>
                    </summary>
                    <JsonPreview value={block.data} />
                  </details>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-muted-foreground">
                This older snapshot retained the representative raw payload and
                schema types, but predates normalized entity blocks.
              </p>
            )}
            {structured.parseErrors.length > 0 ? (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                {structured.parseErrors.length} structured-data block(s) could
                not be parsed; their original script text remains in raw data.
              </p>
            ) : null}
            {structured.blocksTruncated ? (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                Normalized entity display is capped at 200 blocks; every
                original payload remains available in raw data and Copy JSON.
              </p>
            ) : null}
          </>
        )}
      </div>
      <RawEvidence value={snapshot.structured_data} />
    </SectionCard>
  );
}

function ResourceRow({ item }: { item: ParsedSnapshotResource }) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-2.5 py-2">
      {item.kind === "image" ? (
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={item.url}
          className="block truncate font-mono text-[10px] text-foreground hover:text-primary"
        >
          {resourceFileName(item.url)}
        </a>
        <p className="truncate text-[9px] text-muted-foreground">
          {item.tag ?? "resource"}
          {item.rel ? ` · ${item.rel}` : ""}
          {item.mimeType ? ` · ${item.mimeType}` : ""}
        </p>
      </div>
      <Badge variant="outline" className="h-5 shrink-0 text-[9px]">
        {formatText(item.kind)}
      </Badge>
    </div>
  );
}

export function PageResourcesCard({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const resources = parseSnapshotResources(snapshot.extracted);
  const images = parseSnapshotImages(snapshot.images);
  const kinds = Object.entries(resources.counts).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const [selectedKind, setSelectedKind] = useState("all");
  const visibleItems =
    selectedKind === "all"
      ? resources.items
      : resources.items.filter((item) => item.kind === selectedKind);
  const imageResources = resources.items.filter(
    (item) => item.kind === "image",
  );
  const payload = {
    resources: isJsonRecord(snapshot.extracted)
      ? (snapshot.extracted.resources ?? {})
      : {},
    images: snapshot.images,
  };
  return (
    <SectionCard
      title="Page resources"
      collapsible
      anchor="resources"
      copy={{
        ...webCopy({
          kind: "web-page-resources",
          label: "Page resources",
          description:
            "Complete DOM-declared resource inventory for the page: images, video, audio, embeds, scripts, styles, fonts, documents, and related assets.",
          surface: `Page resources — ${page.url}`,
          data: payload,
          lines: [
            ["URL", page.url],
            ["Resources", resources.count],
            ["Images", images.count],
            ...kinds.map(([kind, count]): [string, number] => [
              formatText(kind),
              count,
            ]),
          ],
          attributes: { page_id: page.id, snapshot_id: snapshot.id },
        }),
        json: () => payload,
      }}
    >
      <div className="p-3">
        {resources.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Resource inventory is not available for this older snapshot. Fetch
            the page again after the crawler update to populate it.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={selectedKind === "all" ? "secondary" : "outline"}
                className="h-6 px-2 text-[10px]"
                onClick={() => setSelectedKind("all")}
              >
                All {resources.count}
              </Button>
              {kinds.map(([kind, count]) => (
                <Button
                  key={kind}
                  type="button"
                  size="sm"
                  variant={selectedKind === kind ? "secondary" : "outline"}
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setSelectedKind(kind)}
                >
                  {formatText(kind)} {count}
                </Button>
              ))}
            </div>
            {selectedKind === "image" && imageResources.length > 0 ? (
              <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {imageResources.map((resource, index) => {
                  const image = images.items.find(
                    (candidate) =>
                      candidate.src === resource.url ||
                      candidate.srcset.includes(resource.url),
                  );
                  return (
                    <a
                      key={`${resource.url}-${index}`}
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-muted/20"
                    >
                      {/* Observed external page image; its load failure remains visible. */}
                      <img
                        src={resource.url}
                        alt={image?.alt ?? ""}
                        className="aspect-video w-full object-cover"
                      />
                      <div className="p-1.5">
                        <p className="truncate font-mono text-[9px]">
                          {resourceFileName(resource.url)}
                        </p>
                        <p className="truncate text-[9px] text-muted-foreground">
                          {image?.featured
                            ? "featured image"
                            : image?.alt === null
                              ? "alt missing"
                              : image?.alt ||
                                resource.sourceAttribute ||
                                "image"}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 max-h-80 divide-y divide-border/50 overflow-y-auto rounded-md border border-border/70">
                {visibleItems.map((item, index) => (
                  <ResourceRow
                    key={`${item.kind}-${item.url}-${index}`}
                    item={item}
                  />
                ))}
              </div>
            )}
            {resources.truncated ? (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                The page declared more than 5,000 unique resources. Counts cover
                all observed items; the raw item list is capped at 5,000.
              </p>
            ) : null}
          </>
        )}
      </div>
      <RawEvidence value={payload as Json} />
    </SectionCard>
  );
}
