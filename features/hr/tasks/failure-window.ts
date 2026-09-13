// KNOB MIRROR of platform.feature_knob "hr.tasks" "failure_initial_limit" — a synchronous pure function with a unit test on the value.
// Change the row, then re-mirror this literal; the value has no sync read path.
export const HR_FAILURE_INITIAL_LIMIT = 8;
export const HR_FAILURE_PAGE_INCREMENT = 25;

export function nextHrFailureLimit(total: number, current: number): number {
    return Math.min(
        Math.max(0, total),
        Math.max(HR_FAILURE_INITIAL_LIMIT, current) + HR_FAILURE_PAGE_INCREMENT,
    );
}
