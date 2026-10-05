"use client";

/**
 * ResultRecordRef — a `resource_ref` pointer drawn as the record it points
 * to: the record's title and its door (`EntityRef`: open, new tab, peek).
 * THE DOOR LAW: the value names a record, so the record opens.
 *
 * The title is read through the one title service (session-cached, chunked);
 * until it lands — or when the record is gone or out of reach — the entity's
 * own label stands in, never the raw pointer.
 */

import React, { useEffect, useState } from "react";
import { EntityRef } from "@ai-matrx/chat/host/ui-slots";
import { entityTitleFallback, fetchEntityTitles, getCachedEntityTitle } from "@ai-matrx/chat/host/ui-slots";
import { resolveEntityToken } from "@ai-matrx/chat/host/ui-slots";

export interface ResultRecordRefProps {
    /** The pointer's `resource_type`. */
    token: string;
    /** The pointer's `resource_id`. */
    id: string;
    /** The pointer's own `label` — the name the person sees on the record. */
    label?: string;
}

export function ResultRecordRef({ token, id, label }: ResultRecordRefProps) {
    const canonical = resolveEntityToken(token);
    const [title, setTitle] = useState<string | null>(() =>
        getCachedEntityTitle(canonical, id),
    );

    useEffect(() => {
        let live = true;
        fetchEntityTitles(canonical, [id])
            .then((titles) => {
                const found = titles.get(id);
                if (live && found) setTitle(found);
            })
            .catch((error: unknown) => {
                // The door still works without the title; say why it is missing.
                console.warn(
                    `[ResultRecordRef] could not read the title of ${canonical} ${id}`,
                    error,
                );
            });
        return () => {
            live = false;
        };
    }, [canonical, id]);

    return (
        <EntityRef
            token={canonical}
            id={id}
            name={title ?? (label || entityTitleFallback(canonical))}
            openInNewTab
            className="text-sm"
        />
    );
}

export default ResultRecordRef;
