/** @deprecated Legacy applet broker system — removed. Types kept for compile-only stubs. */

export interface BrokerIdentifier {
  source: string;
  mappedItemId: string;
  sourceId?: string;
}

export interface BrokerMapEntry {
  brokerId: string;
  mappedItemId: string;
  source: string;
  sourceId: string;
}

export interface BrokerOption {
  id: string;
  label: string;
  value?: unknown;
  selected?: boolean;
}

export interface BrokerTableColumn {
  id: string;
  label: string;
  order?: number;
}

export interface BrokerTableRow {
  id: string;
  order?: number;
  cells?: Record<string, unknown>;
}

export interface BrokerTableState {
  columns: BrokerTableColumn[];
  rows: BrokerTableRow[];
}
