"use client";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

/** One scope-aware explanation for code-owned and system-owned definitions. */
export function DefinitionEditHelp({
  data,
  section,
  authoring,
}: {
  data: Pick<MandateWorkspaceData, "offer" | "provisionKey" | "contract"> & {
    mandate: Pick<
      MandateWorkspaceData["mandate"],
      "label" | "mandate_key" | "origin" | "code_path" | "output_kind"
    >;
  };
  section: "Goal" | "Provision" | "Output";
  authoring: boolean;
}) {
  if (!authoring) {
    return (
      <p>
        This mandate’s {section.toLowerCase()} cannot be edited here because it
        belongs to the platform definition. To change the definition, create a
        separate mandate and connect it to a surface or another part of the
        system you control. Changing the Holder does not change this definition.
      </p>
    );
  }

  const codeOwned =
    section === "Provision"
      ? Boolean(data.offer)
      : data.mandate.origin === "code";
  const [location, provisionLocation] = [
    section === "Provision" ? data.offer?.codePath : data.mandate.code_path,
    data.offer?.codePath,
  ].map((path) => {
    const value = path?.trim();
    return value && value !== "unknown" ? value : null;
  });
  const relatedLocation =
    section === "Output" && !location ? provisionLocation : null;
  const message = codeOwned
    ? `This ${section.toLowerCase()} is defined in code and cannot be edited here. Edit its source declaration, then synchronize the registry.`
    : `This ${section.toLowerCase()} has no editor on this page. Do not change a code declaration unless the mandate is code-owned.`;
  const current =
    section === "Provision"
      ? data.offer?.values
      : {
          format: data.mandate.output_kind,
          requiredFields: data.contract.requiredOutputKeys,
        };
  const handoff = {
    mandate: data.mandate.label,
    mandateKey: data.mandate.mandate_key,
    section,
    reason: message,
    sourceLocation: location ?? "Not recorded",
    ...(section === "Provision"
      ? { provisionKey: data.provisionKey, provision: data.offer?.label }
      : {}),
    ...(relatedLocation ? { relatedProvisionModule: relatedLocation } : {}),
    current,
    instructions: !codeOwned
      ? "This page has no editor for this field. Confirm the supported authoring path before changing it; do not treat a database-owned definition as a code mirror."
      : location
        ? "Inspect the recorded declaration and apply the requested change in its owning repository. Verify every mandate sharing this Provision, synchronize the registry, and test its consumers. Do not edit the mirrored database declaration to bypass code ownership."
        : "Locate the declaration by its mandate/provision key and confirm its owning repository before editing. A related Provision module is a search starting point, not a verified Output declaration location. Record the missing source location, apply the requested change, synchronize the registry, and test its consumers.",
  };
  return (
    <div className="space-y-3">
      <p>{message}</p>
      <dl className="space-y-2">
        {section === "Provision" && data.offer ? (
          <div>
            <dt className="font-semibold">Provision</dt>
            <dd>{data.offer.label}</dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold">Source location</dt>
          <dd className="[overflow-wrap:anywhere]">
            {location ?? "Not recorded"}
          </dd>
        </div>
        {relatedLocation ? (
          <div>
            <dt className="font-semibold">Related Provision module</dt>
            <dd className="[overflow-wrap:anywhere]">{relatedLocation}</dd>
          </div>
        ) : null}
      </dl>
      {!location ? (
        <p>The exact declaration location must be confirmed before editing.</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Copy source instructions</span>
        <CopyButtons
          size="icon"
          label={`${section} source instructions`}
          human={[
            message,
            `Source location: ${location ?? "Not recorded"}`,
            relatedLocation
              ? `Related Provision module: ${relatedLocation}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")}
          agent={() => ({
            kind: "mandate-definition-edit",
            location: "Mandate administration",
            description: `Code edit handoff for ${data.mandate.label}: ${section}`,
            data: handoff,
          })}
        />
      </div>
    </div>
  );
}
