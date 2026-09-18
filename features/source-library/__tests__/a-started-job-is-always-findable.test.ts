/**
 * A JOB THAT STARTED IS A JOB THIS SCREEN CAN FIND — the sibling of
 * `library-row-shape.test.ts`, one endpoint over, and this one cost real money.
 *
 * WHAT HAPPENED (independently reproduced 2026-09-17/18, Radiolab, two episodes,
 * $2.19 committed). `POST /media/libraries/{id}/jobs` returned **HTTP 201** with a
 * real running job — and wrapped it: `{"job": {"id": "57d902fb-…", "status":
 * "running", …}}`. `API-CONTRACT.md` §7.3 publishes a BARE Job row. The screen read
 * `job.id`, got nothing, and refused honestly:
 *
 *   > "this job.id" should be text and arrived as nothing at all.
 *
 * Honest, and useless. The server had already accepted and started billable paid
 * work. Twelve minutes later the Library still read "0 running, 0 queued" — because
 * the page's only door back to a job was a `localStorage` list of ids, and the id
 * had never arrived to be remembered. A person who had just approved a spend had no
 * way, from this screen, to learn whether their transcript finished, failed, or was
 * still running.
 *
 * TWO INDEPENDENT FAILURES, so this file guards both:
 *
 *   1. the response shape — now read either way (`asJobRow`), so a client and a
 *      server deploying minutes apart cannot resurrect this;
 *   2. THE MISSING DOOR — `GET /media/libraries/{id}/jobs`, the contract's own
 *      "job discovery door", which the server has always served and this client had
 *      never once called. That is the real defect: with it, the durable rows answer
 *      "what is running here?" no matter what the create call returned.
 *
 * RED PROOF (both verified failing before the fix):
 *   • change `read(result, asJobRow)` back to `read(result, parseJobRow)` in
 *     `createJob` → "reads the job out of the envelope…" fails, because the parser
 *     is handed the wrapper and reports `id` as missing.
 *   • delete `listLibraryJobs` from `../api` → this file does not compile, which is
 *     the point: the door cannot quietly go away again.
 */

const callApi = jest.fn();

jest.mock("@/lib/api/call-api", () => ({
    __esModule: true,
    callApi: (config: unknown) => callApi(config),
}));

import { createJob, listLibraryJobs } from "../api";

const dispatch = ((thunk: unknown) => thunk) as never;

const LIBRARY_ID = "e5d4c3b2-a190-4877-9c66-1f2e3d4c5b6a";

/** The job the server really started for the Radiolab selection. */
const JOB = {
    id: "57d902fb-3c41-4a2e-8b77-9d0e1f2a3b4c",
    library_id: LIBRARY_ID,
    action: "transcribe",
    status: "running",
    allow_paid: true,
    parallelism: 4,
    totals: {
        total: 2,
        queued: 1,
        running: 1,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
    },
    progress_percent: 0,
};

afterEach(() => jest.clearAllMocks());

describe("starting a job", () => {
    it("reads the job out of the envelope the server sent when this was found", async () => {
        callApi.mockReturnValue({ data: { job: JOB } });
        const row = await createJob(dispatch, LIBRARY_ID, {
            estimate_token: "est_01J",
        });
        expect(row.id).toBe(JOB.id);
        expect(row.status).toBe("running");
    });

    it("reads the bare row the contract publishes, which the server now sends", async () => {
        callApi.mockReturnValue({ data: JOB });
        const row = await createJob(dispatch, LIBRARY_ID, {
            estimate_token: "est_01J",
        });
        expect(row.id).toBe(JOB.id);
        expect(row.status).toBe("running");
    });

    it("a job whose id cannot be read is REFUSED, never reported as started", async () => {
        // The one shape that must still fail loudly: no id anywhere. Money may
        // have been spent, and pretending we hold a trackable job would be worse
        // than saying plainly that we do not.
        callApi.mockReturnValue({ data: { job: { status: "running" } } });
        await expect(
            createJob(dispatch, LIBRARY_ID, { estimate_token: "est_01J" }),
        ).rejects.toThrow();
    });
});

describe("the job-discovery door", () => {
    it("asks the server which jobs belong to this Library", async () => {
        callApi.mockReturnValue({
            data: { jobs: [JOB], total: 1, limit: 10, offset: 0 },
        });
        const found = await listLibraryJobs(dispatch, LIBRARY_ID, {
            status: ["pending", "running"],
            limit: 10,
        });
        expect(found.jobs.map((job) => job.id)).toEqual([JOB.id]);
        expect(found.total).toBe(1);

        const config = callApi.mock.calls[0][0] as {
            path: string;
            method: string;
            pathParams: Record<string, string>;
            queryParams: Record<string, unknown>;
        };
        expect(config.path).toBe("/media/libraries/{library_id}/jobs");
        expect(config.method).toBe("GET");
        expect(config.pathParams.library_id).toBe(LIBRARY_ID);
        expect(config.queryParams.status).toBe("pending,running");
    });

    it("FINDS A JOB THIS BROWSER NEVER LEARNED THE ID OF — the whole point", async () => {
        // Exactly the Radiolab situation: the create response was unreadable, so
        // nothing on this device knows `57d902fb…` exists. The server's durable
        // rows do, and that is now the authority the page mounts from.
        callApi.mockReturnValue({
            data: { jobs: [JOB], total: 1, limit: 10, offset: 0 },
        });
        const found = await listLibraryJobs(dispatch, LIBRARY_ID, {
            status: ["pending", "running"],
        });
        expect(found.jobs).toHaveLength(1);
        expect(found.jobs[0].id).toBe(JOB.id);
        expect(found.jobs[0].status).toBe("running");
    });

    it("an empty Library is an empty list, never a refusal", async () => {
        callApi.mockReturnValue({ data: { jobs: [], total: 0, limit: 10, offset: 0 } });
        const found = await listLibraryJobs(dispatch, LIBRARY_ID);
        expect(found.jobs).toEqual([]);
        expect(found.total).toBe(0);
    });

    it("a server refusal reaches the screen as a sentence, never as silence", async () => {
        callApi.mockReturnValue({
            error: {
                type: "http_error",
                status: 500,
                message: "The jobs for this Library could not be listed.",
                serverDetail: {
                    message: "The jobs for this Library could not be listed.",
                    code: "job_list_failed",
                },
            },
        });
        await expect(listLibraryJobs(dispatch, LIBRARY_ID)).rejects.toThrow(
            "could not be listed",
        );
    });
});
