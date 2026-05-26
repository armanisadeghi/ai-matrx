import FromBase64ShellClient from "./FromBase64ShellClient";

/**
 * /image-studio/from-base64
 *
 * Paste a base64 string (raw or full `data:` URL), preview the decoded image,
 * and save it to the cloud library with a persistent share URL.
 *
 * The body is a `"use client"` component that runs the decoder + upload
 * entirely in the browser.
 *
 * Header + outer chrome are owned by `(tools)/layout.tsx`.
 */
export default function FromBase64Page() {
  return <FromBase64ShellClient />;
}
