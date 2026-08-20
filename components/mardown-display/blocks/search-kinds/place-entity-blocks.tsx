"use client";

/**
 * Canonical components for `local_place`, `entity_card`, and `ai_answer`.
 * Nested primitive kinds (rating / postal_address / opening_hours /
 * geo_coordinates) render through THEIR canonical components — composed, not
 * re-implemented.
 */

import React, { useState } from "react";
import { BrainCircuit, ExternalLink, Globe, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isRecord,
  num,
  readSearchKindValue,
  records,
  strings,
  text,
} from "./search-kind-data";
import { SearchChip, SearchFavicon } from "./search-kind-shared";
import {
  GeoCoordinatesBlock,
  OpeningHoursBlock,
  PostalAddressBlock,
  RatingBlock,
} from "./primitive-blocks";

interface SearchKindBlockProps {
  serverData?: unknown;
  className?: string;
}

const ExtThumb: React.FC<{ src: string; className?: string }> = ({
  src,
  className,
}) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
     
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// local_place
// ─────────────────────────────────────────────────────────────────────────────

export function LocalPlaceBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue(serverData);
  const name = text(value.name);
  if (!name) return null;

  const website = text(value.website_url);
  const phone = text(value.phone);
  const chips = [...strings(value.categories), ...strings(value.cuisine)];
  const price = text(value.price_text);
  const thumbnail = text(value.thumbnail);
  const hoursText = text(value.hours_text);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {website ? (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
            >
              {name}
            </a>
          ) : (
            <span className="text-sm font-semibold text-foreground">{name}</span>
          )}
          {price && <span className="text-xs text-muted-foreground">{price}</span>}
        </div>

        {isRecord(value.rating) && (
          <div className="mt-0.5">
            <RatingBlock serverData={value.rating} />
          </div>
        )}

        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {chips.slice(0, 6).map((chip, i) => (
              <SearchChip key={i}>{chip}</SearchChip>
            ))}
          </div>
        )}

        {text(value.description) && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {text(value.description)}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-1">
          {isRecord(value.address) && <PostalAddressBlock serverData={value.address} />}
          {phone && (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>{phone}</span>
            </a>
          )}
          {isRecord(value.hours) ? (
            <OpeningHoursBlock serverData={value.hours} className="mt-1" />
          ) : (
            hoursText && (
              <span className="text-xs text-muted-foreground">{hoursText}</span>
            )
          )}
          {isRecord(value.coordinates) && (
            <GeoCoordinatesBlock serverData={value.coordinates} />
          )}
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="truncate">Website</span>
            </a>
          )}
        </div>
      </div>

      {thumbnail && (
        <ExtThumb
          src={thumbnail}
          className="h-20 w-20 flex-shrink-0 rounded-md border border-border object-cover"
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// entity_card — the knowledge-panel card (e.g. built from Wikipedia).
// ─────────────────────────────────────────────────────────────────────────────

export function EntityCardBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue(serverData);
  const name = text(value.name);
  if (!name) return null;

  const image = text(value.image);
  const website = text(value.website_url);
  const sourceUrl = text(value.source_url);
  const facts = records(value.facts);
  const profiles = records(value.profiles);
  const description = text(value.long_description) ?? text(value.description);

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-foreground">{name}</div>
          {text(value.category) && (
            <div className="text-xs text-muted-foreground">{text(value.category)}</div>
          )}
          {isRecord(value.rating) && (
            <div className="mt-1">
              <RatingBlock serverData={value.rating} />
            </div>
          )}
          {description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-1.5 text-xs text-primary underline-offset-2 hover:underline"
                >
                  source
                </a>
              )}
            </p>
          )}
        </div>
        {image && (
          <ExtThumb
            src={image}
            className="h-24 w-24 flex-shrink-0 rounded-md border border-border object-cover"
          />
        )}
      </div>

      {facts.length > 0 && (
        <dl className="mt-3 grid gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
          {facts.slice(0, 8).map((fact, i) => {
            const label = text(fact.label);
            const factText = text(fact.text);
            if (!label || !factText) return null;
            const links = strings(fact.links);
            return (
              <React.Fragment key={i}>
                <dt className="font-medium text-foreground">{label}</dt>
                <dd className="text-muted-foreground">
                  {links.length > 0 ? (
                    <a
                      href={links[0]}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {factText}
                    </a>
                  ) : (
                    factText
                  )}
                </dd>
              </React.Fragment>
            );
          })}
        </dl>
      )}

      {isRecord(value.coordinates) && (
        <div className="mt-2">
          <GeoCoordinatesBlock serverData={value.coordinates} />
        </div>
      )}

      {(profiles.length > 0 || website) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary"
            >
              <Globe className="h-3.5 w-3.5" />
              Website
            </a>
          )}
          {profiles.slice(0, 8).map((profile, i) => {
            const pName = text(profile.name);
            const pUrl = text(profile.url);
            if (!pName || !pUrl) return null;
            return (
              <a
                key={i}
                href={pUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:border-primary/40 hover:text-primary"
              >
                <SearchFavicon
                  iconUrl={text(profile.favicon)}
                  url={pUrl}
                  className="h-3.5 w-3.5 rounded"
                />
                {pName}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ai_answer — the provider's synthesized answer with its references.
// ─────────────────────────────────────────────────────────────────────────────

export function AiAnswerKindBlock({ serverData, className }: SearchKindBlockProps) {
  const { value } = readSearchKindValue(serverData);
  const blocks = records(value.blocks);
  if (blocks.length === 0) return null;
  const references = records(value.references);

  return (
    <div
      className={cn(
        "rounded-lg border border-primary/25 bg-primary/[0.03] p-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <BrainCircuit className="h-3.5 w-3.5" />
        <span>AI answer</span>
        {text(value.source) && <span className="opacity-70">· {text(value.source)}</span>}
      </div>

      <div className="space-y-2">
        {blocks.map((block, i) => {
          const type = text(block.type);
          if (type === "heading") {
            return text(block.text) ? (
              <div key={i} className="text-sm font-semibold text-foreground">
                {text(block.text)}
              </div>
            ) : null;
          }
          if (type === "list") {
            const items = strings(block.items);
            return items.length > 0 ? (
              <ul key={i} className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            ) : null;
          }
          return text(block.text) ? (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {text(block.text)}
            </p>
          ) : null;
        })}
      </div>

      {references.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {references.map((ref, i) => {
            const url = text(ref.url);
            if (!url) return null;
            const label = text(ref.source_name) ?? url;
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
                title={url}
              >
                <SearchFavicon url={url} className="h-3.5 w-3.5 rounded" />
                <span className="truncate">{label}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
