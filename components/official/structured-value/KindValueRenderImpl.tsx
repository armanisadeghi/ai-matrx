"use client";

// components/official/structured-value/KindValueRenderImpl.tsx
//
// The far side of the kind front door (`KindValueFrontDoor`). Imported ONLY
// through that door's `React.lazy` edge — never statically — so the kind stack
// (AnswerValueView → KindInstanceRender → the content-ir runtime) stays out of
// every raw leaf's chunk until a leaf actually meets kind data.

import {
  AnswerValueView,
  type AnswerValueViewProps,
} from "@/components/official/structured-value/AnswerValueView";

export default function KindValueRenderImpl(props: AnswerValueViewProps) {
  return <AnswerValueView {...props} />;
}
