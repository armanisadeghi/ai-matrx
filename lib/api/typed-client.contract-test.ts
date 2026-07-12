/**
 * lib/api/typed-client.contract-test.ts
 *
 * Compile-time proof that the typed client binds callsites to the OpenAPI
 * contract. This file is type-checked, never executed — every `@ts-expect-error`
 * below MUST stay an error. If `pnpm type-check` reports "Unused '@ts-expect-error'"
 * here, the guarantee has regressed: the client stopped catching a wrong shape.
 *
 * (Excluded from the bundle — type-only, no runtime imports of it exist.)
 */
import { apiGet, apiPost, apiMultipart, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

async function _proofs() {
  // --- Wrong PATH is a compile error -------------------------------------
  // @ts-expect-error — not a path in the contract
  await apiGet("/this/path/does/not/exist");

  // --- Wrong POST BODY KEY is a compile error ----------------------------
  // The old bug shape: `key` instead of `preset_id`. The JSON preview
  // endpoint takes the typed body directly, so this is caught at the callsite.
  await apiPost("/assets/preview", {
    source: { file_id: "x" },
    max_inline_bytes: 262144,
    variants: [
      {
        // @ts-expect-error — `key` was renamed to `preset_id` on the server
        key: "chrome-web-store",
        width: 128,
        height: 128,
      },
    ],
  });

  // --- Correct POST BODY compiles ----------------------------------------
  const spec: components["schemas"]["PreviewVariantSpec"] = {
    preset_id: "chrome-web-store",
    width: 128,
    height: 128,
    format: "webp",
    quality: 85,
    fit: "cover",
    position: "center",
    background_color: "#ffffff",
  };
  await apiPost("/assets/preview", {
    source: { file_id: "x" },
    max_inline_bytes: 262144,
    variants: [spec],
  });

  // --- Response is DERIVED, not asserted ---------------------------------
  const form = new FormData();
  const { data } = await apiMultipart("/assets/preview/multipart", form);
  // Real field on AssetPreviewVariant — compiles.
  data.variants[0]?.preset_id;
  // @ts-expect-error — `key` is not a field on the real response variant
  data.variants[0]?.key;

  // --- Path params keep the literal type ---------------------------------
  await apiGet(buildPath("/assets/{file_id}", { file_id: "abc" }));
}
