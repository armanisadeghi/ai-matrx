/**
 * FORCING FUNCTION: an unrelated DOM change never makes the persistent-component
 * connector scan the whole document.
 *
 * THE DEFECT (2026-09-26): PersistentDOMConnector observed every mutation under
 * <body> and answered each one with document.querySelectorAll — on a 1 MB page
 * (118k elements) that was 587 ms of scanning over 15 s of diagrams drawing.
 * It now reacts only to mutations that touch a persistent component or its
 * placeholder, once per frame.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PersistentDOMConnector } from "../PersistentDOMConnector";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("unrelated insertions do not scan the document; a placeholder does", async () => {
  jest.useFakeTimers();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<PersistentDOMConnector />));
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  const spy = jest.spyOn(document, "querySelectorAll");

  await act(async () => {
    for (let i = 0; i < 20; i++) document.body.appendChild(document.createElement("p"));
    await Promise.resolve();
    jest.advanceTimersByTime(50);
  });
  expect(spy).not.toHaveBeenCalled();

  await act(async () => {
    const ph = document.createElement("div");
    ph.setAttribute("data-placeholder-for", "x");
    document.body.appendChild(ph);
    await Promise.resolve();
    jest.advanceTimersByTime(50);
  });
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
  await act(async () => root.unmount());
  jest.useRealTimers();
});
