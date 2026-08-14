export const UNWIRED_DETECTORS = [
  "react-component-unmounted",
  "export-unimported",
  "router-unmounted",
  "host-installer-unset",
  "scheduler-handler-unregistered",
  "python-module-unreached",
] as const;

export type UnwiredDetector = (typeof UNWIRED_DETECTORS)[number];
export type UnwiredRepository = "matrx-frontend" | "aidream";

export const DETECTOR_TITLES: Record<UnwiredDetector, string> = {
  "react-component-unmounted": "React components with no JSX mounter",
  "export-unimported": "Hooks, services, and producers with no runtime importer",
  "router-unmounted": "FastAPI routers with no include_router path",
  "host-installer-unset": "Required host installers with no host call",
  "scheduler-handler-unregistered": "Scheduler handlers with no registration",
  "python-module-unreached": "Python service modules unreachable from an entry point",
};

export interface UnwiredFinding {
  repository: UnwiredRepository;
  detector: UnwiredDetector;
  file: string;
  line: number;
  column: number;
  symbol: string;
  /** Physical implementation lines implicated by the finding. */
  lines: number;
  title: string;
  evidence: string;
  intent: string;
  remains: string;
  feature: string;
}

export interface UnwiredAllowlistEntry {
  repository: UnwiredRepository;
  detector: UnwiredDetector;
  file: string;
  symbol: string;
  reason: string;
}

export interface UnwiredBucket {
  key: string;
  findings: number;
  lines: number;
}

export interface UnwiredTotals {
  findings: number;
  lines: number;
  filesWithFindings: number;
  filesScanned: number;
  suppressed: number;
  byDetector: Record<UnwiredDetector, number>;
  byRepository: Record<UnwiredRepository, number>;
}

export interface UnwiredReport {
  generatedAt: string;
  commit: string | null;
  aidreamCommit: string | null;
  totals: UnwiredTotals;
  partial: string[];
  worstFiles: UnwiredBucket[];
  findings: UnwiredFinding[];
  allowlist: UnwiredAllowlistEntry[];
}

export interface UnwiredHistoryPoint {
  generatedAt: string;
  commit: string | null;
  findings: number;
  lines: number;
  filesWithFindings: number;
}
