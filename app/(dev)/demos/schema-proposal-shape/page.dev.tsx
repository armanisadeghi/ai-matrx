"use client";

/**
 * Dev harness for the schema_proposal block's apply targets — renders
 * SchemaProposalBlock from a fixture proposal so both "Apply to an agent"
 * and "Create a Shape" can be driven without prompting the JSON Schema
 * Generator agent. Auto-discovered by the /demos index.
 */

import React from "react";
import SchemaProposalBlock from "@/features/agents/components/schema-proposal/SchemaProposalBlock";

const FIXTURE = {
  name: "Customer Interview Summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      customer: { type: "string", description: "Customer name" },
      sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
      score: { type: "number", minimum: 0, maximum: 10 },
      key_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            topic: { type: "string" },
            quote: { type: "string" },
          },
          required: ["topic"],
        },
      },
    },
    required: ["customer", "sentiment", "key_points"],
  },
};

export default function SchemaProposalShapeDemo() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">
        schema_proposal apply targets
      </h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Fixture-rendered SchemaProposalBlock. Use Create a Shape to exercise
        the content_ir write path (definitions, edges, canonical example,
        trigger verdict).
      </p>
      <SchemaProposalBlock content={JSON.stringify(FIXTURE)} />
    </div>
  );
}
