export function selectEnrollmentId(
  deepLinkedEnrollment: string | null,
  selectedEnrollment: string | null,
  firstActiveEnrollment?: string,
): string | null {
  return deepLinkedEnrollment ?? selectedEnrollment ?? firstActiveEnrollment ?? null;
}
