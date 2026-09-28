/**
 * page-image-offer-values.ts — pure builders for the image provisions' mapped-only
 * offered values (consumed by generate-page-image.ts).
 */

import { compactOfferValues } from "@/features/marketing/lib/offer-values";
import type {
  MarketingImagePromptOffer,
  MarketingPageImageAllInOneOffer,
  MarketingPageImageOffer,
} from "@/types/python-generated/provision-offers";

/**
 * The REAL facts a caller holds about the image being ordered, named exactly
 * as the image provisions declare them. Every key is optional: a caller sends
 * only what it actually holds (the page plan card knows the page; the brand
 * asset desk knows the site, dimensions and media rules). These are
 * mapped-only offers (aidream `client_mandates.py`, pass_by_name=False): the
 * mandate door drops them unless a binding's consumption map names them, so
 * adding them never changes what a current Holder receives.
 */
export type PageImageFacts = Partial<
  Pick<
    MarketingImagePromptOffer,
    | "page_url"
    | "page_path"
    | "image_description"
    | "alt_text"
    | "placement"
    | "page_target_keyword"
    | "image_type"
    | "site_name"
    | "site_url"
    | "width_px"
    | "height_px"
    | "file_format"
    | "site_media_rules"
  >
>;

/** `marketing.image_prompt` mapped-only offers, from the caller's facts. */
export function imagePromptOfferValues(
  facts: PageImageFacts | undefined,
): Partial<MarketingImagePromptOffer> {
  if (!facts) return {};
  return compactOfferValues({
    page_url: facts.page_url,
    page_path: facts.page_path,
    image_description: facts.image_description,
    alt_text: facts.alt_text,
    placement: facts.placement,
    page_target_keyword: facts.page_target_keyword,
    image_type: facts.image_type,
    site_name: facts.site_name,
    site_url: facts.site_url,
    width_px: facts.width_px,
    height_px: facts.height_px,
    file_format: facts.file_format,
    site_media_rules: facts.site_media_rules,
  } satisfies Partial<MarketingImagePromptOffer>);
}

/** `marketing.page_image` mapped-only offers: the ordered spec and style the
 *  prompt was written from, plus the caller's facts. */
export function pageImageOfferValues(
  facts: PageImageFacts | undefined,
  spec: string,
  style: string,
): Partial<MarketingPageImageOffer> {
  return compactOfferValues({
    image_spec: spec,
    style,
    page_url: facts?.page_url,
    page_path: facts?.page_path,
    alt_text: facts?.alt_text,
    placement: facts?.placement,
    width_px: facts?.width_px,
    height_px: facts?.height_px,
    file_format: facts?.file_format,
    site_name: facts?.site_name,
  } satisfies Partial<MarketingPageImageOffer>);
}

/** `marketing.page_image_all_in_one` mapped-only offers. */
export function allInOneOfferValues(
  facts: PageImageFacts | undefined,
): Partial<MarketingPageImageAllInOneOffer> {
  if (!facts) return {};
  return compactOfferValues({
    page_url: facts.page_url,
    page_path: facts.page_path,
    image_description: facts.image_description,
    alt_text: facts.alt_text,
    placement: facts.placement,
    page_target_keyword: facts.page_target_keyword,
    site_name: facts.site_name,
  } satisfies Partial<MarketingPageImageAllInOneOffer>);
}
