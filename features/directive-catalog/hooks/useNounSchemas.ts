"use client";

/**
 * useNounSchemas — ONE noun's write item schemas (`{create, update, delete}`),
 * loaded when a form for that noun opens (`GET /directives/catalog/{noun}`).
 * The catalog summary carries no schemas (lane G12, 2026-10-07). Instant when
 * this tab already loaded the noun; shared in-flight request otherwise.
 */

import { useEffect, useState } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  loadNounSchemas,
  peekNounSchemas,
} from "@/features/directive-catalog/catalogCache";
import type { DirectiveNounSchemas } from "@/features/directive-catalog/types";

export type NounSchemaMap = NonNullable<DirectiveNounSchemas["schemas"]>;

export interface UseNounSchemasResult {
  /** `{class: JSON Schema}`; `null` while loading, on error, or with no noun. */
  schemas: NounSchemaMap | null;
  loading: boolean;
  error: string | null;
}

export function useNounSchemas(noun: string | null): UseNounSchemasResult {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const requestKey = noun && baseUrl ? `${baseUrl}|${noun}` : null;
  const [answer, setAnswer] = useState<{
    key: string;
    schemas: NounSchemaMap | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!noun || !baseUrl || !requestKey) return;
    let cancelled = false;
    loadNounSchemas(baseUrl, noun)
      .then((found) => {
        if (!cancelled) {
          setAnswer({ key: requestKey, schemas: found.schemas ?? {}, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAnswer({
            key: requestKey,
            schemas: null,
            error: `Couldn't load this type's fields (${err instanceof Error ? err.message : "unknown error"}).`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [noun, baseUrl, requestKey]);

  if (!noun) return { schemas: null, loading: false, error: null };
  if (!baseUrl) {
    return {
      schemas: null,
      loading: false,
      error: "No server is configured, so this type's fields cannot be loaded.",
    };
  }
  const loaded = peekNounSchemas(baseUrl, noun);
  if (loaded) return { schemas: loaded.schemas ?? {}, loading: false, error: null };
  if (answer && answer.key === requestKey) {
    return { schemas: answer.schemas, loading: false, error: answer.error };
  }
  return { schemas: null, loading: true, error: null };
}
