/** @deprecated Legacy applet broker system — compile-only tombstone. Do not extend. */

export { brokerActions, default as brokerReducer } from "./slice";
export { brokerSelectors, coreSelectors } from "./selectors";
export type {
  BrokerIdentifier,
  BrokerMapEntry,
  BrokerOption,
  BrokerTableColumn,
  BrokerTableRow,
  BrokerTableState,
} from "./types";
export { usePreviewBrokers, useFieldsWithBrokers, useServerBrokerSync } from "./hooks/useTempBroker";
