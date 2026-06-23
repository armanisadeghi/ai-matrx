/**
 * The one normalized shape the SERP primitive renders, plus the raw backend
 * item shapes the three SEO tools emit and the normalizers between them.
 *
 * Backend source of truth: aidream `seo/utils/meta_calculators.py`
 *   - seo_check_meta_tags_batch -> { batch_analysis: MetaTagBatchItem[], count }
 *   - seo_check_meta_titles      -> { title_analysis: TitleAnalysisItem[], count }
 *   - seo_check_meta_descriptions-> { description_analysis: DescriptionAnalysisItem[], count }
 *
 * Tool checks already precompute pixels / chars / *_ok server-side, so the
 * renderers TRUST those values and never re-measure. The live calculator page
 * (which has no server result) measures in-browser via `metrics.ts` instead.
 */

/**
 * Normalized SERP entry — everything `SerpResult` needs to render one
 * simulated Google result, with optional precomputed validation. All fields
 * optional so a title-only or description-only check renders gracefully.
 */
export interface SerpEntry {
  /** Page URL. Absent for tool checks (the backend does not send one). */
  url?: string;
  title?: string;
  titlePixels?: number;
  titleChars?: number;
  titleOk?: boolean;
  titleDesktopOk?: boolean;
  titleMobileOk?: boolean;
  titleIssues?: string[];
  description?: string;
  descriptionPixels?: number;
  descriptionChars?: number;
  descriptionOk?: boolean;
  descriptionDesktopOk?: boolean;
  descriptionMobileOk?: boolean;
  descriptionIssues?: string[];
  /** Overall pass for the row (server `overall_ok` / `*_ok`). */
  overallOk?: boolean;
}

// ─── Raw backend item shapes ────────────────────────────────────────────────

export interface MetaTagBatchItem {
  title: string;
  description: string;
  title_pixels: number;
  title_chars: number;
  title_ok: boolean;
  title_issues?: string[];
  description_pixels: number;
  description_chars: number;
  description_ok: boolean;
  description_issues?: string[];
  overall_ok: boolean;
}

export interface TitleAnalysisItem {
  title: string;
  pixel_width: number;
  character_count: number;
  desktop_ok: boolean;
  mobile_ok: boolean;
  seo_length_ok: boolean;
  too_short?: boolean;
  issues?: string[];
  title_ok: boolean;
}

export interface DescriptionAnalysisItem {
  description: string;
  pixel_width: number;
  character_count: number;
  desktop_ok: boolean;
  mobile_ok: boolean;
  seo_length_ok: boolean;
  too_short?: boolean;
  issues?: string[];
  description_ok: boolean;
}

export interface SeoMetaTagsResult {
  batch_analysis: MetaTagBatchItem[];
  count: number;
}

export interface SeoTitlesResult {
  title_analysis: TitleAnalysisItem[];
  count: number;
}

export interface SeoDescriptionsResult {
  description_analysis: DescriptionAnalysisItem[];
  count: number;
}

// ─── Normalizers (raw item -> SerpEntry) ────────────────────────────────────

export function batchItemToEntry(item: MetaTagBatchItem): SerpEntry {
  return {
    title: item.title,
    titlePixels: item.title_pixels,
    titleChars: item.title_chars,
    titleOk: item.title_ok,
    titleIssues: item.title_issues,
    description: item.description,
    descriptionPixels: item.description_pixels,
    descriptionChars: item.description_chars,
    descriptionOk: item.description_ok,
    descriptionIssues: item.description_issues,
    overallOk: item.overall_ok,
  };
}

export function titleItemToEntry(item: TitleAnalysisItem): SerpEntry {
  return {
    title: item.title,
    titlePixels: item.pixel_width,
    titleChars: item.character_count,
    titleOk: item.title_ok,
    titleDesktopOk: item.desktop_ok,
    titleMobileOk: item.mobile_ok,
    titleIssues: item.issues,
    overallOk: item.title_ok,
  };
}

export function descriptionItemToEntry(item: DescriptionAnalysisItem): SerpEntry {
  return {
    description: item.description,
    descriptionPixels: item.pixel_width,
    descriptionChars: item.character_count,
    descriptionOk: item.description_ok,
    descriptionDesktopOk: item.desktop_ok,
    descriptionMobileOk: item.mobile_ok,
    descriptionIssues: item.issues,
    overallOk: item.description_ok,
  };
}
