/**
 * The heading an agent app shows over a run error. Custom apps and every
 * template render the legacy error prop's `type` as that heading
 * (`{error.type}`), so it must read as a sentence — it used to be the machine
 * code `execution_error`. Analytics keep their own machine `errorType`.
 */
export const APP_RUN_ERROR_TITLE = "Couldn't run this";
