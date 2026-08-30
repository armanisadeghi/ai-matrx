// features/scopes/service/commentsService.ts
//
// HOST WIRING (W6 comments adoption, 2026-08-30): the `cmt_*` chokepoint
// lives in `@ai-matrx/associations/core` (createCommentsService); bound here
// to the host store under the historical name (it replaced
// `features/comments/service/commentsService.ts`, deleted per C9). Still the
// ONE `cmt_*` chokepoint — no other file may call those RPCs.

import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export const commentsService = getAssociationsStore().services.comments;
