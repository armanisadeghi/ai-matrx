"use client";

/**
 * Client boundary for /tools/product-capture/item/[id] — the view-mode
 * detail surface (data loads client-side; header injected via PageHeader).
 */

import { ItemDetailView } from "@/features/product-capture/components/ItemDetailView";

export default function ItemDetailRouteClient({ itemId }: { itemId: string }) {
  return <ItemDetailView itemId={itemId} />;
}
