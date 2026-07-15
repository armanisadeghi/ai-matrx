"use server";

/** Compatibility seam retained while old demo bookmarks age out. */
export async function processMessage(_formData: FormData): Promise<never> {
  throw new Error(
    "This legacy voice assistant has been retired. Use the voice playground.",
  );
}
