/** platform.search_engine_indexed_state(type, id) — access ladder T-12. */
export type SearchEngineIndexedState =
  | { enrolled: false }
  | {
      enrolled: true;
      /** The record is published to the web (its `published_to_web`, plus its own lifecycle). */
      published_to_web: boolean;
      /** The creator's choice; null = follow the type default. */
      value: boolean | null;
      /** The type knob, resolved for the record's organization. */
      type_default: boolean;
      /** What search engines are told right now. */
      effective: boolean;
      can_change: boolean;
    };
