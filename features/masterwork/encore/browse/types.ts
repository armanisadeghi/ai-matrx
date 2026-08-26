import type { EncoreMasterwork, EncoreShelf } from "../service";

export interface EncoreListRow extends EncoreMasterwork {
  scope: EncoreShelf["scope"];
}
