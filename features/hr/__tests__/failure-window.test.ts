import {
    HR_FAILURE_INITIAL_LIMIT,
    HR_FAILURE_PAGE_INCREMENT,
    nextHrFailureLimit,
} from "@/features/hr/tasks/failure-window";

describe("HR decision failure disclosure", () => {
    it("keeps the initial DOM bounded and reveals only one deliberate page at a time", () => {
        const total = 8_786;
        expect(HR_FAILURE_INITIAL_LIMIT).toBe(8);

        const afterOneClick = nextHrFailureLimit(total, HR_FAILURE_INITIAL_LIMIT);
        expect(afterOneClick).toBe(HR_FAILURE_INITIAL_LIMIT + HR_FAILURE_PAGE_INCREMENT);
        expect(afterOneClick).toBeLessThan(total);

        expect(nextHrFailureLimit(total, total - 2)).toBe(total);
        expect(nextHrFailureLimit(3, HR_FAILURE_INITIAL_LIMIT)).toBe(3);
    });
});
