"use client";

/**
 * Surface runtime for the Feature Docs viewer page
 * (`/administration/documentation/feature-docs/view/[[...path]]`).
 *
 * The view page is a Server Component (it reads `admin.feature_docs`
 * server-side via `createClient()`), so it cannot call the `SurfaceRuntimeProvider`
 * hook itself. This thin client wrapper takes the already-loaded doc as a
 * plain prop and registers it — nested INSIDE `FeatureDocsShell`'s provider
 * (this route has no shell, but the pattern still nests correctly if one is
 * ever added), so while a doc is open its scope wins over any ancestor.
 */

import { useCallback } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_DOCUMENTATION_SURFACE_NAME,
  createAdminDocumentationScope,
} from "@/features/surfaces/manifests/admin-documentation.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { FeatureDocDetail } from "@/features/feature-docs/service";

export function FeatureDocViewerRuntime({
  path,
  doc,
  children,
}: {
  path: string;
  doc: FeatureDocDetail;
  children: React.ReactNode;
}) {
  const getScope = useCallback((): SurfaceScopePayload => {
    return createAdminDocumentationScope({
      documentation_section: "view",
      current_doc_path: path,
      current_doc: {
        id: doc.id,
        path: doc.path,
        slug: doc.slug,
        title: doc.title,
        area: doc.area,
        content: doc.content,
        content_hash: doc.content_hash,
        sync_base_hash: doc.sync_base_hash,
        sync_base_commit: doc.sync_base_commit,
        synced_at: doc.synced_at,
        updated_at: doc.updated_at,
        version: doc.version,
        metadata: doc.metadata,
      },
    });
  }, [path, doc]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_DOCUMENTATION_SURFACE_NAME}
      getScope={getScope}
    >
      {children}
    </SurfaceRuntimeProvider>
  );
}
