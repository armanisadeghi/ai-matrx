/** @deprecated Legacy applet broker selectors — always return empty defaults. */

import type { RootState } from "@/lib/redux/store";
import type { BrokerIdentifier, BrokerMapEntry, BrokerOption, BrokerTableState } from "./types";

const EMPTY_MAP: Record<string, BrokerMapEntry> = {};
const EMPTY_VALUES: Record<string, unknown> = {};
const EMPTY_OPTIONS: BrokerOption[] = [];
const EMPTY_TABLE: BrokerTableState = { columns: [], rows: [] };

const noopBrokerId = (_state: RootState, _id: BrokerIdentifier | string): string | undefined =>
  typeof _id === "string" ? _id : undefined;

const noopValue = (_state: RootState, _brokerId?: string | BrokerIdentifier): unknown => undefined;

export const brokerSelectors = {
  selectMap: (_state: RootState): Record<string, BrokerMapEntry> => EMPTY_MAP,
  selectAllValues: (_state: RootState): Record<string, unknown> => EMPTY_VALUES,
  selectValue: noopValue,
  selectBrokerId: noopBrokerId,
  selectMultipleValues: (_state: RootState, _ids: string[]): Record<string, unknown> => EMPTY_VALUES,
  selectValueWithoutBrokerId: (_state: RootState, _id: BrokerIdentifier): unknown => undefined,
  selectText: (_state: RootState, _brokerId: string | BrokerIdentifier): string => "",
  selectBrokerOptions: (_state: RootState, _id: BrokerIdentifier): BrokerOption[] => EMPTY_OPTIONS,
  selectSelectedOptions: (_state: RootState, _id: BrokerIdentifier): BrokerOption[] => EMPTY_OPTIONS,
  selectOptionById: (_state: RootState, _id: BrokerIdentifier, _optionId: string): BrokerOption | undefined =>
    undefined,
  selectFilteredOptions: (_state: RootState, _id: BrokerIdentifier, _query: string): BrokerOption[] =>
    EMPTY_OPTIONS,
  selectTable: (_state: RootState, _id: BrokerIdentifier): BrokerTableState => EMPTY_TABLE,
  selectSortedRows: (_state: RootState, _id: BrokerIdentifier): BrokerTableState["rows"] => [],
  selectSortedColumns: (_state: RootState, _id: BrokerIdentifier): BrokerTableState["columns"] => [],
};

export const coreSelectors = brokerSelectors;
