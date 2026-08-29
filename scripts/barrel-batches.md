# Barrel Import Migration — Subagent Batches

**108 partial barrel `index.ts` files** need their consumers migrated to direct imports, then the barrel deleted.

## Instructions for each subagent

For every `index.ts` in your assigned batch:
1. Find every file that imports from it (search for `from '@/path/to/dir'` or `from '@/path/to/dir/index'`)
2. Rewrite each import to point directly to the actual source file that exports the symbol
3. Once all consumers are migrated, delete the `index.ts` barrel file
4. Do NOT create any new `index.ts` barrel files

---

## Batch 1 (1–10)
```
1.  app/(public)/free/zip-code-heatmap/components/index.ts
2.  app/entities/forms/index.ts
3.  components/api-test-config/index.ts
4.  components/diff/index.ts
5.  components/generic-table/index.ts
6.  components/hierarchy-filter/index.ts
7.  components/layout/adaptive-layout/index.ts
8.  components/matrx/AnimatedForm/index.ts
9.  components/matrx/AnimatedRevealCard/index.ts
10. components/matrx/ArmaniForm/field-components/index.ts
```

## Batch 2 (11–20)
```
11. components/matrx/Entity/index.ts
12. components/matrx/Entity/prewired-components/layouts/parts/index.ts
13. components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/index.ts
14. components/matrx/Entity/prewired-components/quick-reference/index.ts
15. components/matrx/buttons/index.tsx
16. components/matrx/input/index.tsx
17. components/matrx/matrx-collapsible/index.ts
18. components/matrx/matrx-record-list/index.ts
19. components/matrx/navigation/index.ts
20. components/official-candidate/voice-pad/index.ts
```

## Batch 3 (21–30)
```
21. ~~components/official/bottom-sheet/index.ts~~ (directory deleted 2026-08-29 — BottomSheet family moved to @ai-matrx/design-system)
22. components/official/content-editor/index.ts
23. components/official/image-cropper/index.ts
24. components/official/mobile-action-bar/index.ts
25. components/official/settings/index.ts
26. components/official/unified-list/index.ts
27. components/playground/templates/index.ts
28. components/ssr/index.ts
29. components/ui/context-menu/index.ts
30. components/ui/samples/index.ts
```

## Batch 4 (31–40)
```
31. features/agent-connections/redux/skl/index.ts
32. features/agent-connections/redux/ui/index.ts
33. features/agent-context/components/hierarchy-selection/index.ts
34. features/agent-context/components/scope-admin/index.ts
35. features/agent-context/redux/scope/index.ts
36. features/agent-shortcuts/components/index.ts
37. features/agents/components/agent-listings/core/index.ts
38. features/agents/components/conversation-history/index.ts
39. features/agents/redux/agent-filter/index.ts
40. features/ai-runs/types/index.ts
```

## Batch 5 (41–50)
```
41. features/applet/builder/modules/smart-parts/applets/index.ts
42. features/applet/builder/modules/smart-parts/apps/index.ts
43. features/applet/builder/modules/smart-parts/containers/index.ts
44. features/applet/builder/modules/smart-parts/fields/index.ts
45. features/applet/builder/modules/smart-parts/index.ts
46. features/applet/home/app-display/index.ts
47. features/applet/home/applet-card/index.ts
48. features/applet/home/index.ts
49. features/applet/home/main-layout/index.ts
50. features/applet/runner/fields/index.ts
```

## Batch 6 (51–60)
```
51. features/applet/runner/header/common/index.ts
52. features/applet/runner/layouts/core/index.ts
53. features/applet/runner/layouts/options/index.ts
54. features/code-editor/components/index.ts
55. features/code/adapters/index.ts
56. features/code/chat/index.ts
57. features/code/library-sources/index.ts
58. features/code/runtime/index.ts
59. features/cx-dashboard/types/index.ts
60. features/files/components/core/FileActions/index.ts
```

## Batch 7 (61–70)
```
61. features/files/components/core/FileBreadcrumbs/index.ts
62. features/files/components/core/FileContextMenu/index.ts
63. features/files/components/core/FileIcon/index.ts
64. features/files/components/core/FileInfo/index.ts
65. features/files/components/core/FileList/index.ts
66. features/files/components/core/FileMeta/index.ts
67. features/files/components/core/FilePreview/index.ts
68. features/files/components/core/FileTree/index.ts
69. features/files/components/core/FileUploadDropzone/index.ts
70. features/files/components/core/FileVersions/index.ts
```

## Batch 8 (71–80)
```
71. features/files/components/core/PermissionsDialog/index.ts
72. features/files/components/core/ShareLinkDialog/index.ts
73. features/html-pages/components/tabs/index.ts
74. features/math/components/index.ts
75. features/prompt-actions/types/index.ts
76. features/prompt-apps/components/index.ts
77. features/prompt-apps/sample-code/templates/index.ts
78. features/prompt-apps/types/index.ts
79. features/prompt-builtins/admin/index.ts
80. features/prompt-builtins/hooks/index.ts
```

## Batch 9 (81–90)
```
81. features/prompt-builtins/index.ts
82. features/prompt-builtins/types/index.ts
83. features/prompts/components/resource-display/index.ts
84. features/prompts/components/smart/index.ts
85. features/prompts/components/universal-editor/editors/index.ts
86. features/prompts/components/universal-editor/index.ts
87. features/prompts/components/variable-inputs/index.tsx
88. features/prompts/index.ts
89. features/resource-manager/resource-picker/index.ts
90. features/scraper/hooks/index.ts
```

## Batch 10 (91–100)
```
91.  features/shell/components/header/variants/index.ts
92.  features/tasks/widgets/index.ts
93.  features/text-diff/index.ts
94.  features/tool-call-visualization/dynamic/index.ts
95.  features/tool-call-visualization/testing/stream-processing/index.ts
96.  features/versioning/components/index.ts
97.  features/versioning/index.ts
98.  features/window-panels/windows/image/index.ts
99.  features/workflows-xyflow/common/index.ts
100. features/workflows-xyflow/node-editor/tabs/index.ts
```

## Batch 11 (101–108)
```
101. features/workflows/react-flow/node-editor/workflow-node-editor/custom-workflow-nodes/index.ts
102. features/workflows/react-flow/node-editor/workflow-node-editor/custom-workflow-nodes/tabs/index.ts
103. lib/chat-protocol/index.ts
104. lib/email/templates/index.ts
105. lib/redux/prompt-execution/index.ts
106. lib/redux/prompt-execution/thunks/index.ts
107. lib/redux/slices/agent-settings/index.ts
108. lib/sync/index.ts
```

---

*Generated after knip analysis on 2026-04-25. Re-run knip before starting a batch to check if any entries are already fully eliminated and can be skipped or deleted outright.*
