/**
 * THE `estimate.estimate_token` DEFECT — verify-4, 2026-09-18.
 *
 * `common-docs/projects/media-source-catalog/FIRST-PERSON-TEST.md`
 * "Independent re-test, verify-4" reproduced this live, twice, on two
 * different libraries (a podcast and a YouTube channel): a transcription Job
 * was created (`201`), then reading it back (`GET /media/jobs/{id}` and
 * `GET /media/libraries/{id}/jobs`) threw —
 *
 *   "The server sent this screen a shape it cannot read: 'this
 *   job.estimate.estimate_token' should be text and arrived as nothing at
 *   all (the field was missing)."
 *
 * — and because `GET …/jobs` parsed its `jobs` array with a plain `.map()`,
 * that ONE bad Job took every OTHER Job on the Library down with it: "the
 * running-jobs panel shows the same shape error instead of the job", Cancel
 * unreachable, Export broken by the same trip.
 *
 * API-CONTRACT.md §7.3 (v0.5.5) settles this: `estimate_token` IS NULLABLE,
 * and whether it is required is the Action's OWN `requires_estimate`
 * declaration — never this field's presence. A free Action "mints and
 * confirms its own estimate in one breath", and that frozen estimate can
 * legitimately carry no token.
 *
 * RED PROOF (do not trust this comment — run it):
 *   git show origin/main:features/source-library/contract.ts \
 *     | sed -n '539,596p'  # the old `str(row.estimate_token, …)`
 *   Restoring that one line (`estimate_token: str(...)` instead of
 *   `optStr(...)`) makes block A's first two tests throw exactly the
 *   sentence above, and block B's test collapses to zero jobs instead of two.
 */

import {
    parseEstimateResult,
    parseJobListResponse,
    parseJobRow,
} from "../contract";

/** The verifier's own reconstructed shape: a Job whose estimate is real but carries no token. */
function jobWithNullEstimateToken(overrides: Record<string, unknown> = {}) {
    return {
        id: "9c22b9c1-b001-4c1e-9c1a-000000000001",
        library_id: "6b1f1111-2222-3333-4444-555555555555",
        organization_id: "org-1",
        action: "transcribe",
        name: "Transcribe 2 videos",
        status: "running",
        parallelism: 8,
        allow_paid: false,
        totals: { total: 2, queued: 1, running: 1, succeeded: 0, failed: 0, skipped: 0 },
        lane_totals: { free_captions: 2 },
        // Exactly what verify-4 saw on the wire: the estimate object is real
        // (every OTHER field present), only `estimate_token` is absent.
        estimate: {
            estimate_token: null,
            expires_at: null,
            action: "transcribe",
            selected_count: 2,
            already_done: 0,
            free_count: 2,
            paid_count: 0,
            skipped_count: 0,
            paid_video_ids: [],
            cost: {
                currency: "USD",
                free_cost: 0,
                paid_cost_estimate: 0,
                paid_cost_low: 0,
                paid_cost_high: 0,
                basis: "2 videos, free captions",
            },
            time: {
                free_seconds_estimate: 4,
                paid_seconds_estimate: 0,
                wall_seconds_estimate: 4,
                parallelism: 8,
            },
            // Omitted, not `null` — an estimate never spends YouTube quota
            // (§7.2), so the server leaves this key out entirely; that is the
            // one shape `parseEstimateResult` treats as compatible.
            warnings: [],
            requires_confirmation: false,
        },
        estimate_confirmed_at: "2026-09-18T00:00:00Z",
        progress_percent: 0,
        error: null,
        started_at: "2026-09-18T00:00:00Z",
        completed_at: null,
        created_at: "2026-09-18T00:00:00Z",
        operation_id: "op-1",
        ...overrides,
    };
}

describe("A · a Job whose estimate carries no token reads fine, field by field", () => {
    it("parseEstimateResult reads a null estimate_token instead of refusing the whole estimate", () => {
        const result = parseEstimateResult(jobWithNullEstimateToken().estimate, "the estimate");
        expect(result.estimate_token).toBeNull();
        expect(result.expires_at).toBeNull();
        // Every OTHER field is still read, and still refuses if IT goes bad —
        // this is not a blanket bypass of the estimate's own honesty.
        expect(result.selected_count).toBe(2);
        expect(result.cost.basis).toBe("2 videos, free captions");
    });

    it("parseJobRow reads the whole Job, not just the estimate", () => {
        const job = parseJobRow(jobWithNullEstimateToken(), "this job");
        expect(job.id).toBe("9c22b9c1-b001-4c1e-9c1a-000000000001");
        expect(job.estimate).not.toBeNull();
        expect(job.estimate?.estimate_token).toBeNull();
        expect(job.status).toBe("running");
    });
});

describe("B · one Job's bad shape never hides its siblings on the running-jobs door", () => {
    it("keeps every OTHER Job when one Job in the same GET …/jobs page is unreadable", () => {
        const goodJobA = jobWithNullEstimateToken({ id: "job-a", name: "Transcribe A" });
        // A DIFFERENT, genuinely broken row: `totals` — a required object —
        // arrives as a string. This is not the estimate defect; it proves the
        // list-level guard is general, not a one-field patch.
        const brokenJob = jobWithNullEstimateToken({
            id: "job-broken",
            totals: "not an object",
        });
        const goodJobB = jobWithNullEstimateToken({ id: "job-b", name: "Transcribe B" });

        const response = parseJobListResponse({
            jobs: [goodJobA, brokenJob, goodJobB],
            total: 3,
            limit: 10,
            offset: 0,
        });

        // The two good Jobs are BOTH still here — neither was hidden by the
        // broken one, regardless of where in the array it sat.
        expect(response.jobs.map((j) => j.id)).toEqual(["job-a", "job-b"]);
        // And the broken one is named, not silently dropped.
        expect(response.row_problems).toHaveLength(1);
        expect(response.row_problems[0]).toContain("jobs[1].totals");
        expect(response.row_problems[0]).toContain("Nothing has been guessed or hidden");
    });

    it("a page where every Job reads fine reports zero row problems", () => {
        const response = parseJobListResponse({
            jobs: [jobWithNullEstimateToken({ id: "job-a" }), jobWithNullEstimateToken({ id: "job-b" })],
            total: 2,
            limit: 10,
            offset: 0,
        });
        expect(response.jobs).toHaveLength(2);
        expect(response.row_problems).toEqual([]);
    });
});
