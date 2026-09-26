// features/education/onboard/startRoutes.ts
//
// The ONE address of the study-kit front door, and of its "My files" tab. Every
// Education surface that offers "study something you already have" links here —
// there is no second flow, only this door opened on a different tab.

export const EDU_START_HREF = "/education/start";

/** Search-param value that opens the front door on the "My files" tab. */
export const EDU_START_FROM_FILES = "files";

/** `/education/start?from=files` — pick a file you already own, no re-upload. */
export const EDU_STUDY_MY_FILES_HREF = `${EDU_START_HREF}?from=${EDU_START_FROM_FILES}`;
