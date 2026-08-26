import ProofRunsClient from "@/features/proof-runs/components/ProofRunsClient";

/**
 * /administration/compute/proof-runs
 *
 * Route leaf only — every decision lives in the feature
 * (`features/proof-runs/`), and the payload shapes render through their
 * registered kind components.
 */
export default function ProofRunsPage() {
  return <ProofRunsClient />;
}
