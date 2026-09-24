"use client";

// app/(core)/d/[renderId]/page.tsx — ONE RENDERED DOCUMENT, AT ITS OWN ADDRESS.
//
// PRODUCTS row 5. `document_propose` answers a person with a link, and a link
// has to land on the document itself — not on the table it came from, with the
// person left to find which of several documents the agent meant.
//
// 🚨 THE LINK OPENS WHATEVER ORGANIZATION IS SELECTED (2026-09-23). This page
// used to read the document inside the person's SELECTED organization, so the
// link failed for its own author whenever another organization happened to be
// selected, with a sentence guessing that it "may have been made in a different
// organization". Access is decided by the PERSON, never by the selection
// (common-docs/policies/organization-is-the-container.md rule 5): the door
// finds the document by its id alone and answers which organization it lives
// in. The page opens it, names that organization, and offers the switch to a
// member. The store switch is read for the DOCUMENT'S organization, not the
// selected one.
//
// IT OPENS IN `RichDocument`, the platform's ONE rich document, so print and
// save-as-PDF come with it and this page never grows a second renderer that
// could drift from every other document surface in the app.
//
// THE BYTES ARE FROZEN AND THIS PAGE DOES NOT TOUCH THEM. `custom.doc_render`
// holds what was rendered at the moment it was rendered, with a content hash a
// signature is a seal over (VAL-10). So there is no "refresh from the record"
// control here and there must never be one: a document whose words moved under
// a seal would make the seal meaningless.
//
// THE REFUSAL IS THE STORE'S OWN SENTENCE, verbatim. `custom.doc_render_read`
// refuses somebody who may not see the record this document is about, in
// English; anything this page wrote over the top would be worse.

import { use, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { RichDocument } from "@/features/rich-document/RichDocument";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { createClient } from "@/utils/supabase/client";
import { recordsDataSource } from "@ai-matrx/records-ui";

/** What `custom.doc_render_read` answers — the frozen bytes, what they are of, and where they live. */
interface RenderedDocument {
    render_id: string;
    template_id: string;
    document_version: number;
    record_id: string;
    body: string;
    content_hash: string;
    rendered_at: string;
    organization_id: string;
    organization_name: string | null;
    viewer_is_member: boolean;
}

export default function RenderedDocumentRoute({
    params,
}: {
    params: Promise<{ renderId: string }>;
}) {
    const { renderId } = use(params);
    const dispatch = useAppDispatch();
    const selectedOrganizationId = useAppSelector(selectOrganizationId);

    const [document, setDocument] = useState<RenderedDocument | null>(null);
    // Set when the read failed: its raw error, or `error: null` for a zero-row
    // answer. Null while the document is opening or has opened.
    const [refusal, setRefusal] = useState<{ error: unknown } | null>(null);

    // ONE SWITCH, asked about the organization the DOCUMENT lives in.
    const campaign = useUnifiedDataCampaign({
        organizationId: document?.organization_id ?? null,
        organizationState: document ? "ready" : "resolving",
        storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
    });

    useEffect(() => {
        let stopped = false;
        setDocument(null);
        setRefusal(null);
        void (async () => {
            // p_organization_id is accepted and ignored by the door: the document is found by
            // its id, and its own organization is the one checked.
            const { data, error } = await recordsDataSource(createClient()).rpc(
                "doc_render_read",
                { p_organization_id: selectedOrganizationId, p_render_id: renderId },
                { schema: "custom" },
            );
            if (stopped) return;
            if (error) {
                setRefusal({ error });
                return;
            }
            const rows = (Array.isArray(data) ? data : data ? [data] : []) as RenderedDocument[];
            if (rows.length === 0) {
                setRefusal({ error: null });
                return;
            }
            setDocument(rows[0]);
        })();
        return () => {
            stopped = true;
        };
        // The selected organization is deliberately NOT a dependency: switching it must never
        // re-decide whether this document opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderId]);

    const elsewhere =
        document !== null &&
        document.viewer_is_member &&
        document.organization_id !== selectedOrganizationId;
    const organizationName = document?.organization_name ?? "its organization";

    return (
        <>
            <PageHeader>
                <HeaderStructured title="Document" />
            </PageHeader>
            <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
                {refusal ? (
                    // The door's own refusal (or a zero-row answer) goes to the
                    // canonical gate, which prints a server sentence verbatim.
                    <AccessGate
                        token="doc_render"
                        id={renderId}
                        error={refusal.error ?? undefined}
                    />
                ) : document === null ? (
                    <p className="text-sm text-muted-foreground">Opening this document…</p>
                ) : campaign.state !== "on" ? (
                    /* THE ONE NOTICE — resolving, could-not-check and off are three
                       different things (lane SHARE-OUT, item 3). */
                    <UnifiedDataSwitchNotice gate={campaign} what="Documents" />
                ) : (
                    <div className="mx-auto max-w-3xl space-y-3">
                        {elsewhere && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                                <span>
                                    This document is in <strong>{organizationName}</strong>, not the
                                    organization you are working in.
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                        dispatch(
                                            chooseActiveOrganization({
                                                id: document.organization_id,
                                                name: document.organization_name,
                                            }),
                                        )
                                    }
                                >
                                    Switch to {organizationName}
                                </Button>
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Made {new Date(document.rendered_at).toLocaleString()} in{" "}
                            {organizationName} from version {document.document_version} of its
                            wording. These words are frozen as they were at that moment — that is
                            what a signature on this document is over.
                        </p>
                        <div className="rounded-md border border-border p-4">
                            {/* THE PLATFORM'S ONE RICH DOCUMENT. Print and save-as-PDF
                                live in its own overflow menu. */}
                            <RichDocument
                                content={document.body}
                                source={{ type: "raw" }}
                                actionsVariant="mini-bar"
                            />
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
