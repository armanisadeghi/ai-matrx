"use client";

/**
 * features/cms/components/settings/SiteAdvancedSettings.tsx
 *
 * Real editors for the site-level config agents can already write but humans
 * previously could only stare at as read-only JSON (WF-6): `theme_config`,
 * `navigation`, `footer_config`, `contact_info`, `social_links`.
 *
 * Shapes are the RENDERER's contracts (my-matrx):
 * - theme_config: `{group: {key: value}}` → CSS custom properties
 *   (`colors.primary_teal` → `--color-primary-teal`; top-level scalars →
 *   `--{key}`). Values failing the render-time safety allowlist are DROPPED at
 *   render (aidream `theme_css.py` / my-matrx `themeCss.js` are the twins —
 *   this editor deliberately does NOT re-implement that validator; it only
 *   surfaces the rule).
 * - navigation: `[{label, href}]` — a non-empty array overrides the derived
 *   show_in_nav menu verbatim.
 * - footer_config: LAYOUT ONLY (Arman 2026-07-27) — columns/flags/copyright;
 *   contact + social CONTENT comes from contact_info / social_links.
 * - contact_info: `{phone, phone_raw, email?, address: {street, city, state, zip}}`.
 * - social_links: `{platform: url}` map.
 *
 * Each section edits a local draft and saves through the ONE existing
 * `CmsSiteService.updateSite` path, sending only its own field. Unknown keys
 * on the stored objects are preserved (drafts spread over the original).
 *
 * AGENT WRITES: three of these sections also service a `matrx-user/cms-site`
 * write target — `site_theme_config`, `site_navigation`, `site_footer_config`
 * — each registered from the section that owns the draft, via
 * `useSurfaceWriteHandlers`. A handler only sets the same local state the
 * user's typing sets; the human still clicks that section's Save, and no
 * handler ever calls `CmsSiteService` itself. The fourth target
 * (`site_global_css`) belongs to the settings page, which owns that buffer.
 * See the `writeTargets` doc comment in
 * `features/surfaces/manifests/cms-site.manifest.ts` for what earns a target
 * here and what deliberately does not.
 */

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Save, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/lib/toast";
import { CmsSiteService } from "@/features/cms/services/cmsService";
import type { ClientSite } from "@/features/cms/types";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CMS_SITE_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsSiteContextMenuProps";

const SURFACE_NAME = CMS_SITE_CONTEXT_MENU_PROPS.surfaceName;

interface SectionProps {
  site: ClientSite;
  onSaved: () => Promise<void> | void;
}

// ── shared bits ─────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface LinkRow {
  label: string;
  href: string;
}

function toLinkRows(value: unknown): LinkRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({ label: str(row.label), href: str(row.href) }));
}

// ── agent-write validation ──────────────────────────────────────────────────
//
// The reader helpers above are deliberately forgiving because they parse a
// STORED row: a malformed value should render as blank, not crash the tab.
// These are the mirror image. They parse a value an AGENT just produced, and
// every one of them THROWS on a bad shape — `applySurfaceWrite` turns the
// throw into an error envelope the agent reads and can correct against, which
// is worth far more than a silently coerced half-write the user then has to
// spot. Never coerce here.

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function requireNoExtraKeys(
  record: Record<string, unknown>,
  allowed: string[],
  what: string,
  note = "",
): void {
  const extra = Object.keys(record).filter((key) => !allowed.includes(key));
  if (extra.length) {
    throw new Error(
      `${what} has unsupported key(s): ${extra.join(", ")}. Only ${allowed.join(", ")} can be written here.${note ? ` ${note}` : ""}`,
    );
  }
}

/** `[{label, href}]`, both required and non-empty. Used by nav + footer links. */
function requireLinkRows(value: unknown, what: string): LinkRow[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} must be an array of { label, href } objects.`);
  }
  return value.map((entry, i) => {
    const row = requireRecord(entry, `${what}[${i}]`);
    requireNoExtraKeys(row, ["label", "href"], `${what}[${i}]`);
    if (typeof row.label !== "string" || !row.label.trim()) {
      throw new Error(`${what}[${i}].label must be a non-empty string.`);
    }
    if (typeof row.href !== "string" || !row.href.trim()) {
      throw new Error(
        `${what}[${i}].href must be a non-empty string — a site-relative path like "/services" for this site's own pages, or a full URL.`,
      );
    }
    return { label: row.label, href: row.href };
  });
}

function SectionCard({
  title,
  hint,
  dirty,
  saving,
  onSave,
  children,
}: {
  title: string;
  hint: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        </div>
        <Button
          size="sm"
          variant={dirty ? "default" : "outline"}
          disabled={!dirty || saving}
          onClick={onSave}
          className="gap-1.5 text-xs shrink-0"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Editable `[{label, href}]` list with reorder — used by nav, footer links. */
function LinkListEditor({
  rows,
  onChange,
  labelPlaceholder = "Label",
  hrefPlaceholder = "/path or https://…",
  addLabel = "Add link",
}: {
  rows: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  labelPlaceholder?: string;
  hrefPlaceholder?: string;
  addLabel?: string;
}) {
  const move = (index: number, delta: number) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={row.label}
            onChange={(e) =>
              onChange(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
            }
            placeholder={labelPlaceholder}
            className="text-sm h-8 flex-1"
          />
          <Input
            value={row.href}
            onChange={(e) =>
              onChange(rows.map((r, j) => (j === i ? { ...r, href: e.target.value } : r)))
            }
            placeholder={hrefPlaceholder}
            className="text-sm h-8 flex-[1.4] font-mono"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-7 shrink-0"
            onClick={() => move(i, -1)}
            disabled={i === 0}
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-7 shrink-0"
            onClick={() => move(i, 1)}
            disabled={i === rows.length - 1}
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            aria-label="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-7"
        onClick={() => onChange([...rows, { label: "", href: "" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

// ── Theme tokens ────────────────────────────────────────────────────────────

interface ThemeRow {
  group: string;
  key: string;
  value: string;
}

function themeToRows(themeConfig: unknown): ThemeRow[] {
  const rows: ThemeRow[] = [];
  const config = asRecord(themeConfig);
  for (const [groupKey, groupValue] of Object.entries(config)) {
    if (typeof groupValue === "string" || typeof groupValue === "number") {
      rows.push({ group: "", key: groupKey, value: String(groupValue) });
      continue;
    }
    for (const [key, value] of Object.entries(asRecord(groupValue))) {
      if (typeof value === "string" || typeof value === "number") {
        rows.push({ group: groupKey, key, value: String(value) });
      }
    }
  }
  return rows;
}

function rowsToTheme(rows: ThemeRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    const group = row.group.trim();
    if (!group) {
      out[key] = row.value;
      continue;
    }
    const bucket = asRecord(out[group]);
    bucket[key] = row.value;
    out[group] = bucket;
  }
  return out;
}

const COLOR_VALUE = /^(#|rgb|hsl)/i;

function cssVarName(row: ThemeRow): string {
  const clean = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!row.group.trim()) return `--${clean(row.key)}`;
  const group = clean(row.group);
  const prefix = group.endsWith("s") ? group.slice(0, -1) : group;
  return `--${prefix}-${clean(row.key)}`;
}

function ThemeSection({ site, onSaved }: SectionProps) {
  const initial = useMemo(() => themeToRows(site.theme_config), [site.theme_config]);
  const [rows, setRows] = useState<ThemeRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  useSurfaceWriteHandlers(SURFACE_NAME, {
    site_theme_config: (value) => {
      const config = requireRecord(value, "site_theme_config");
      // Validate BEFORE handing to themeToRows: that reader drops any leaf it
      // cannot render as a token, which for an agent write would mean a
      // silently truncated palette.
      for (const [groupKey, groupValue] of Object.entries(config)) {
        if (typeof groupValue === "string" || typeof groupValue === "number") {
          continue;
        }
        const bucket = requireRecord(groupValue, `site_theme_config.${groupKey}`);
        for (const [key, leaf] of Object.entries(bucket)) {
          if (typeof leaf !== "string" && typeof leaf !== "number") {
            throw new Error(
              `site_theme_config.${groupKey}.${key} must be a string or number — a theme token is one CSS custom-property value, never a nested object.`,
            );
          }
        }
      }
      const next = themeToRows(config);
      if (next.length === 0) {
        throw new Error(
          "site_theme_config must contain at least one token. This REPLACES every row in the editor, so send the full set you want — read the site_theme_config value to see what is there now.",
        );
      }
      // Same setter the token inputs call, so the human's Save is unchanged.
      setRows(next);
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      await CmsSiteService.updateSite(site.id, { themeConfig: rowsToTheme(rows) });
      await onSaved();
      toast.success("Theme tokens saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Theme Tokens"
      hint="Each row becomes a CSS custom property on the live site (colors.primary → --color-primary). Values that fail the render-time safety allowlist are dropped at render, never served."
      dirty={dirty}
      saving={saving}
      onSave={save}
    >
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={row.group}
              onChange={(e) =>
                setRows(rows.map((r, j) => (j === i ? { ...r, group: e.target.value } : r)))
              }
              placeholder="group (colors)"
              className="text-sm h-8 w-32 font-mono"
            />
            <Input
              value={row.key}
              onChange={(e) =>
                setRows(rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))
              }
              placeholder="key (primary)"
              className="text-sm h-8 w-36 font-mono"
            />
            <div className="relative flex-1">
              <Input
                value={row.value}
                onChange={(e) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                }
                placeholder="value (#0f766e, 1.5rem, 'Inter', sans-serif)"
                className={`text-sm h-8 font-mono ${COLOR_VALUE.test(row.value.trim()) ? "pl-8" : ""}`}
              />
              {COLOR_VALUE.test(row.value.trim()) && (
                <span
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: row.value.trim() }}
                />
              )}
            </div>
            <span className="hidden lg:block text-[10px] text-muted-foreground font-mono w-40 truncate">
              {cssVarName(row)}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              aria-label="Remove token"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-7"
          onClick={() =>
            setRows([
              ...rows,
              { group: rows[rows.length - 1]?.group ?? "colors", key: "", value: "" },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Add token
        </Button>
      </div>
    </SectionCard>
  );
}

// ── Navigation ──────────────────────────────────────────────────────────────

function NavigationSection({ site, onSaved }: SectionProps) {
  const initial = useMemo(() => toLinkRows(site.navigation), [site.navigation]);
  const [rows, setRows] = useState<LinkRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  useSurfaceWriteHandlers(SURFACE_NAME, {
    // An EMPTY array is a legitimate write here, not a no-op: it clears the
    // explicit menu and returns the site to deriving its nav from show_in_nav
    // pages, which is exactly what the editor's own empty state means.
    site_navigation: (value) => {
      setRows(requireLinkRows(value, "site_navigation"));
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      await CmsSiteService.updateSite(site.id, {
        navigation: rows.filter((r) => r.label.trim()),
      });
      await onSaved();
      toast.success("Navigation saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save navigation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Navigation"
      hint="Explicit menu links, rendered in order. Leave EMPTY to auto-derive the menu from pages marked 'Show in navigation' (sorted by sort order). Hrefs are used verbatim."
      dirty={dirty}
      saving={saving}
      onSave={save}
    >
      <LinkListEditor rows={rows} onChange={setRows} addLabel="Add menu link" />
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Menu is currently auto-derived from show-in-nav pages.
        </p>
      )}
    </SectionCard>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────

interface FooterColumn {
  heading: string;
  links: LinkRow[];
}

function FooterSection({ site, onSaved }: SectionProps) {
  const config = useMemo(() => asRecord(site.footer_config), [site.footer_config]);
  const initialColumns = useMemo<FooterColumn[]>(
    () =>
      Array.isArray(config.columns)
        ? config.columns
            .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
            .map((c) => ({ heading: str(c.heading), links: toLinkRows(c.links) }))
        : [],
    [config],
  );
  const [columns, setColumns] = useState<FooterColumn[]>(initialColumns);
  const [showContact, setShowContact] = useState(config.show_contact === true);
  const [contactHeading, setContactHeading] = useState(str(config.contact_heading));
  const [showSocial, setShowSocial] = useState(config.show_social === true);
  const [socialHeading, setSocialHeading] = useState(str(config.social_heading));
  const [copyright, setCopyright] = useState(str(config.copyright));
  const [legalLinks, setLegalLinks] = useState<LinkRow[]>(toLinkRows(config.legal_links));
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => {
    const next: Record<string, unknown> = { ...config };
    next.columns = columns
      .filter((c) => c.heading.trim() || c.links.some((l) => l.label.trim()))
      .map((c) => ({
        heading: c.heading,
        links: c.links.filter((l) => l.label.trim()),
      }));
    next.show_contact = showContact;
    next.show_social = showSocial;
    if (contactHeading.trim()) next.contact_heading = contactHeading;
    else delete next.contact_heading;
    if (socialHeading.trim()) next.social_heading = socialHeading;
    else delete next.social_heading;
    if (copyright.trim()) next.copyright = copyright;
    else delete next.copyright;
    const legal = legalLinks.filter((l) => l.label.trim());
    if (legal.length) next.legal_links = legal;
    else delete next.legal_links;
    return next;
  }, [config, columns, showContact, showSocial, contactHeading, socialHeading, copyright, legalLinks]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  useSurfaceWriteHandlers(SURFACE_NAME, {
    // ONE target for the whole footer object, because the section saves one
    // object — splitting it into seven would make seven ask dialogs for a
    // single edit. Omitted keys keep whatever the editor currently holds;
    // unknown keys are refused rather than accepted and then dropped by
    // `draft` above (which only re-assembles the keys it knows).
    //
    // That refusal has a live trap behind it: real rows carry keys this
    // editor preserves but never edits (`order` on dev-website, for one), and
    // they ARE in the `site_footer_config` value an agent reads. An agent that
    // echoes the whole object back gets refused — so the message has to name
    // the fix, not just the fault.
    site_footer_config: (value) => {
      const next = requireRecord(value, "site_footer_config");
      requireNoExtraKeys(
        next,
        [
          "columns",
          "show_contact",
          "contact_heading",
          "show_social",
          "social_heading",
          "copyright",
          "legal_links",
        ],
        "site_footer_config",
        "Any other key on the saved footer_config (such as `order`) is preserved automatically when the human saves — send only the keys you are changing, not the whole object you read.",
      );
      const bool = (key: string, current: boolean): boolean => {
        if (!(key in next)) return current;
        if (typeof next[key] !== "boolean") {
          throw new Error(`site_footer_config.${key} must be true or false.`);
        }
        return next[key] as boolean;
      };
      const text = (key: string, current: string): string => {
        if (!(key in next)) return current;
        if (typeof next[key] !== "string") {
          throw new Error(`site_footer_config.${key} must be a string.`);
        }
        return next[key] as string;
      };

      let nextColumns = columns;
      if ("columns" in next) {
        if (!Array.isArray(next.columns)) {
          throw new Error(
            "site_footer_config.columns must be an array of { heading, links } objects.",
          );
        }
        nextColumns = next.columns.map((entry, i) => {
          const where = `site_footer_config.columns[${i}]`;
          const column = requireRecord(entry, where);
          requireNoExtraKeys(column, ["heading", "links"], where);
          if (typeof column.heading !== "string") {
            throw new Error(`${where}.heading must be a string.`);
          }
          return {
            heading: column.heading,
            links: requireLinkRows(column.links ?? [], `${where}.links`),
          };
        });
      }
      const nextLegal =
        "legal_links" in next
          ? requireLinkRows(next.legal_links, "site_footer_config.legal_links")
          : legalLinks;

      // Everything validated — only now touch state, so a bad key can never
      // leave the footer half-written.
      setColumns(nextColumns);
      setShowContact(bool("show_contact", showContact));
      setContactHeading(text("contact_heading", contactHeading));
      setShowSocial(bool("show_social", showSocial));
      setSocialHeading(text("social_heading", socialHeading));
      setCopyright(text("copyright", copyright));
      setLegalLinks(nextLegal);
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      await CmsSiteService.updateSite(site.id, { footerConfig: draft });
      await onSaved();
      toast.success("Footer saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save footer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Footer"
      hint="Layout only — renders where a footer component carries the <!--matrx:footer--> token. Contact and social CONTENT comes from the sections below; the footer only toggles whether they appear. Site-relative hrefs (/services) are prefixed automatically on every serving surface."
      dirty={dirty}
      saving={saving}
      onSave={save}
    >
      <div className="space-y-4">
        <div className="space-y-3">
          {columns.map((column, i) => (
            <div key={i} className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Input
                  value={column.heading}
                  onChange={(e) =>
                    setColumns(
                      columns.map((c, j) => (j === i ? { ...c, heading: e.target.value } : c)),
                    )
                  }
                  placeholder="Column heading (Services)"
                  className="text-sm h-8 flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setColumns(columns.filter((_, j) => j !== i))}
                  aria-label="Remove column"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <LinkListEditor
                rows={column.links}
                onChange={(links) =>
                  setColumns(columns.map((c, j) => (j === i ? { ...c, links } : c)))
                }
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={() => setColumns([...columns, { heading: "", links: [] }])}
          >
            <Plus className="h-3.5 w-3.5" />
            Add column
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={showContact}
                onCheckedChange={(v) => setShowContact(v === true)}
                className="shrink-0"
              />
              Show contact block
            </label>
            <Input
              value={contactHeading}
              onChange={(e) => setContactHeading(e.target.value)}
              placeholder="Contact heading (default: Contact)"
              className="text-sm h-8"
              disabled={!showContact}
            />
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={showSocial}
                onCheckedChange={(v) => setShowSocial(v === true)}
                className="shrink-0"
              />
              Show social block
            </label>
            <Input
              value={socialHeading}
              onChange={(e) => setSocialHeading(e.target.value)}
              placeholder="Social heading (default: Follow Us)"
              className="text-sm h-8"
              disabled={!showSocial}
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Copyright line</label>
          <Input
            value={copyright}
            onChange={(e) => setCopyright(e.target.value)}
            placeholder={`Default: © ${new Date().getFullYear()} ${site.name}`}
            className="text-sm h-8"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Legal links</label>
          <LinkListEditor rows={legalLinks} onChange={setLegalLinks} addLabel="Add legal link" />
        </div>
      </div>
    </SectionCard>
  );
}

// ── Contact info ────────────────────────────────────────────────────────────

function ContactSection({ site, onSaved }: SectionProps) {
  const info = useMemo(() => asRecord(site.contact_info), [site.contact_info]);
  const address = useMemo(() => asRecord(info.address), [info]);
  const [phone, setPhone] = useState(str(info.phone));
  const [phoneRaw, setPhoneRaw] = useState(str(info.phone_raw));
  const [email, setEmail] = useState(str(info.email));
  const [street, setStreet] = useState(str(address.street));
  const [city, setCity] = useState(str(address.city));
  const [state, setState] = useState(str(address.state));
  const [zip, setZip] = useState(str(address.zip));
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => {
    const next: Record<string, unknown> = { ...info };
    const set = (key: string, value: string) => {
      if (value.trim()) next[key] = value;
      else delete next[key];
    };
    set("phone", phone);
    set("phone_raw", phoneRaw);
    set("email", email);
    const nextAddress: Record<string, unknown> = { ...address };
    const setAddr = (key: string, value: string) => {
      if (value.trim()) nextAddress[key] = value;
      else delete nextAddress[key];
    };
    setAddr("street", street);
    setAddr("city", city);
    setAddr("state", state);
    setAddr("zip", zip);
    if (Object.keys(nextAddress).length) next.address = nextAddress;
    else delete next.address;
    return next;
  }, [info, address, phone, phoneRaw, email, street, city, state, zip]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(info);

  const save = async () => {
    setSaving(true);
    try {
      await CmsSiteService.updateSite(site.id, { contactInfo: draft });
      await onSaved();
      toast.success("Contact info saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save contact info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Contact Info"
      hint="The single source of truth for the site's contact facts — the footer's contact block (and any component reading contact tokens) renders these."
      dirty={dirty}
      saving={saving}
      onSave={save}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-sm font-medium block mb-1.5">Phone (display)</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="text-sm h-8"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Phone (dial string)</label>
          <Input
            value={phoneRaw}
            onChange={(e) => setPhoneRaw(e.target.value)}
            placeholder="+15551234567"
            className="text-sm h-8 font-mono"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@example.com"
            className="text-sm h-8"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium block mb-1.5">Street</label>
          <Input
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            className="text-sm h-8"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1.5">City</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} className="text-sm h-8" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium block mb-1.5">State</label>
            <Input
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="text-sm h-8"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">ZIP</label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} className="text-sm h-8" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Social links ────────────────────────────────────────────────────────────

interface SocialRow {
  platform: string;
  url: string;
}

function socialToRows(value: unknown): SocialRow[] {
  if (Array.isArray(value)) {
    return value
      .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
      .map((row) => ({
        platform: str(row.platform) || str(row.label),
        url: str(row.url) || str(row.href),
      }));
  }
  return Object.entries(asRecord(value))
    .filter(([, url]) => typeof url === "string")
    .map(([platform, url]) => ({ platform, url: url as string }));
}

function SocialSection({ site, onSaved }: SectionProps) {
  const initial = useMemo(() => socialToRows(site.social_links), [site.social_links]);
  const [rows, setRows] = useState<SocialRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    try {
      const map: Record<string, string> = {};
      for (const row of rows) {
        if (row.platform.trim() && row.url.trim()) map[row.platform.trim()] = row.url.trim();
      }
      await CmsSiteService.updateSite(site.id, { socialLinks: map });
      await onSaved();
      toast.success("Social links saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save social links");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Social Links"
      hint="Platform → profile URL. The footer's social block renders these; platform keys become the labels (instagram → Instagram)."
      dirty={dirty}
      saving={saving}
      onSave={save}
    >
      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={row.platform}
              onChange={(e) =>
                setRows(rows.map((r, j) => (j === i ? { ...r, platform: e.target.value } : r)))
              }
              placeholder="instagram"
              className="text-sm h-8 w-40 font-mono"
            />
            <Input
              value={row.url}
              onChange={(e) =>
                setRows(rows.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))
              }
              placeholder="https://instagram.com/…"
              className="text-sm h-8 flex-1 font-mono"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs h-7"
          onClick={() => setRows([...rows, { platform: "", url: "" }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Add social link
        </Button>
      </div>
    </SectionCard>
  );
}

// ── The block ───────────────────────────────────────────────────────────────

/**
 * The full advanced-settings stack for `/cms/[siteId]/settings`. Each section
 * saves independently (its own field only) so a half-edited footer can never
 * clobber a concurrent theme edit.
 */
export function SiteAdvancedSettings({ site, onSaved }: SectionProps) {
  // Remount sections when the saved row changes so drafts re-seed from truth.
  const key = `${site.id}:${site.updated_at ?? ""}`;
  return (
    <div className="space-y-6" key={key}>
      <ThemeSection site={site} onSaved={onSaved} />
      <NavigationSection site={site} onSaved={onSaved} />
      <FooterSection site={site} onSaved={onSaved} />
      <ContactSection site={site} onSaved={onSaved} />
      <SocialSection site={site} onSaved={onSaved} />
    </div>
  );
}
