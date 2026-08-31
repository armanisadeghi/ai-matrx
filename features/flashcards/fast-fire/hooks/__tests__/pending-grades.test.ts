import { reviewAfterPendingGrades } from "../pending-grades";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("reviewAfterPendingGrades", () => {
  it("never snapshots a partial four-card grade set", async () => {
    const grades: string[] = [];
    const cards = Array.from({ length: 4 }, () => deferred());
    const pending = cards.map(({ promise }, index) =>
      promise.then(() => {
        grades.push(`card-${index + 1}`);
      }),
    );
    const reviewSnapshots: string[][] = [];

    const review = reviewAfterPendingGrades(pending, () => {
      reviewSnapshots.push([...grades]);
    });

    cards[0].resolve();
    cards[1].resolve();
    cards[2].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(reviewSnapshots).toEqual([]);

    cards[3].resolve();
    await review;

    expect(reviewSnapshots).toEqual([["card-1", "card-2", "card-3", "card-4"]]);
  });

  it("runs review after all grades settle even when one grade rejects", async () => {
    const settled: string[] = [];
    const review = reviewAfterPendingGrades(
      [
        Promise.resolve().then(() => settled.push("fulfilled")),
        Promise.reject(new Error("terminal grade failure")),
      ],
      () => {
        settled.push("review");
      },
    );

    await expect(review).resolves.toBeUndefined();
    expect(settled).toEqual(["fulfilled", "review"]);
  });
});
