/**
 * @jest-environment jsdom
 *
 * HELD AND SET for the layer beneath the picker (RC-B6): clicking the picker
 * is "outside" the popover/dialog whose action asked for it. A layer asks
 * `isOrganizationGateInteraction` and stays open for events from inside the
 * picker; everything else still closes it normally.
 */
import {
  ORGANIZATION_GATE_ATTRIBUTE,
  isOrganizationGateInteraction,
} from "../organization-gate";

it("an event from inside the picker keeps the layer open", () => {
  const gate = document.createElement("div");
  gate.setAttribute(ORGANIZATION_GATE_ATTRIBUTE, "");
  const button = document.createElement("button");
  gate.appendChild(button);
  document.body.appendChild(gate);
  expect(isOrganizationGateInteraction({ target: button })).toBe(true);
});

it("an ordinary outside click still closes it", () => {
  const elsewhere = document.createElement("button");
  document.body.appendChild(elsewhere);
  expect(isOrganizationGateInteraction({ target: elsewhere })).toBe(false);
  expect(isOrganizationGateInteraction({ target: null })).toBe(false);
});
