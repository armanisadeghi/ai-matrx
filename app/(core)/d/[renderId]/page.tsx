"use client";

// app/(core)/d/[renderId]/page.tsx — ONE RENDERED DOCUMENT, AT ITS OWN ADDRESS.
//
// PRODUCTS row 5. `document_propose` answers a person with a link, and a link
// has to land on the document itself — not on the table it came from, with the
// person left to find which of several documents the agent meant.
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

import { RichDocument } from "@/features/rich-document/RichDocument";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { createClient } from "@/utils/supabase/client";
import { recordsDataSource } from "@ai-matrx/records-ui";

/** What `custom.doc_render_read` answers — the frozen bytes and what they are of. */
interface RenderedDocument {
    render_id: string;
    template_id: string;
    template_version: number;
    record_id: string;
    body: string;
    content_hash: string;
    rendered_at: string;
}

export default function RenderedDocumentRoute({
    params,
}: {
    params: Promise<{ renderId: string }>;
}) {
    const { renderId } = use(params);
    const { organizationId, organizationState } = useOrganizationRequired();
    // ONE SWITCH: does THIS organization keep its data in the record store?
    const campaign = useUnifiedDataCampaign({
        organizationId,
        organizationState,
        storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
    });

    const [document, setDocument] = useState<RenderedDocument | null>(null);
    const [refusal, setRefusal] = useState<string | null>(null);

    useEffect(() => {
        if (!campaign.on || !organizationId) return;
        let stopped = false;
        void (async () => {
            const { data, error } = await recordsDataSource(createClient()).rpc(
                "doc_render_read",
                { p_organization_id: organizationId, p_render_id: renderId },
                { schema: "custom" },
            );
            if (stopped) return;
            if (error) {
                setRefusal(error.message);
                return;
            }
            const rows = (Array.isArray(data) ? data : data ? [data] : []) as RenderedDocument[];
            if (rows.length === 0) {
                // ABSENT, NEVER DEAD. A document that is not here says so and says the
                // two things that make it not here, rather than showing a blank page.
                setRefusal(
                    "There is no document at this address in this organization. It may have " +
                        "been made in a different organization, or removed.",
                );
                return;
            }
            setDocument(rows[0]);
        })();
        return () => {
            stopped = true;
        };
    }, [campaign.on, organizationId, renderId]);

    return (
        <>
            <PageHeader>
                <HeaderStructured title="Document" />
            </PageHeader>
            <div className="h-full overflow-y-auto pt-[var(--shell-header-h)] p-4">
                {organizationState !== "ready" ? (
                    <OrganizationContextNotice state={organizationState} what="Documents" />
                ) : campaign.state !== "on" ? (
                    /* THE ONE NOTICE — resolving, could-not-check and off are three
                       different things (lane SHARE-OUT, item 3). */
                    <UnifiedDataSwitchNotice gate={campaign} what="Documents" />
                ) : refusal ? (
                    <p className="max-w-2xl text-sm text-destructive">{refusal}</p>
                ) : document === null ? (
                    <p className="text-sm text-muted-foreground">Opening this document…</p>
                ) : (
                    <div className="mx-auto max-w-3xl space-y-3">
                        <p className="text-xs text-muted-foreground">
                            Made {new Date(document.rendered_at).toLocaleString()} from version{" "}
                            {document.template_version} of its wording. These words are frozen as
                            they were at that moment — that is what a signature on this document
                            is over.
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
