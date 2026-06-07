// @ts-nocheck

"use client";

import React from "react";
import { Droppable, Draggable } from "@hello-pangea/dnd";
import { motion } from "motion/react";
import { UseCreateManyToManyReturn } from "@/lib/redux/entity/hooks/useCreateManyToMany";
import { RelationshipMakerConfig } from "./definitions";
import { renderEntityFields } from "./common";
import AssociationPill from "./pills/AssociationPill";
import ChildItemContextMenu from "./context-menus/ChildItemContextMenu";

interface ChildColumnProps {
  config: RelationshipMakerConfig;
  children: any[];
  filteredChildren: any[];
  childSearch: string;
  setChildSearch: (value: string) => void;
  childFilter: string;
  setChildFilter: (value: string) => void;
  selectedChildId: string | null;
  setSelectedChildId: (id: string | null) => void;
  setShowAddChildModal: (show: boolean) => void;
  mappedParents: any[];
  isCreating: boolean;
  manyToManyHook: UseCreateManyToManyReturn;
}

const ChildColumn: React.FC<ChildColumnProps> = ({
  config,
  children,
  filteredChildren,
  childSearch,
  setChildSearch,
  childFilter,
  setChildFilter,
  selectedChildId,
  setSelectedChildId,
  setShowAddChildModal,
  mappedParents,
  isCreating,
  manyToManyHook,
}) => {
  const { getGroupedChildrenByParent } = manyToManyHook;
  return (
    <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col">
      <div className="sticky top-0 z-10 p-2 bg-gray-100 dark:bg-gray-900 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{config.childLabel}</h2>
          <button
            onClick={() => setShowAddChildModal(true)}
            className="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            {config.addChildButtonLabel}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder={`Search ${config.childLabel.toLowerCase()}...`}
            value={childSearch}
            onChange={(e) => setChildSearch(e.target.value)}
            className="flex-1 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={childFilter}
            onChange={(e) => setChildFilter(e.target.value)}
            className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {config.childFilterConfig.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Droppable droppableId="child-deck" isDropDisabled={true}>
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-400 bg-gray-100 dark:bg-gray-900"
          >
            <div className="space-y-2">
              {filteredChildren.map((child: any, index: number) => (
                <Draggable key={child.id} draggableId={child.id} index={index}>
                  {(provided, snapshot) => {
                    const { style, ...draggableProps } =
                      provided.draggableProps;
                    const associatedParents = mappedParents.filter((p: any) =>
                      p[config.childCollectionField].some(
                        (m: any) => m.id === child.id,
                      ),
                    );
                    const isSelected = selectedChildId === child.id;
                    return (
                      <div
                        ref={provided.innerRef}
                        {...draggableProps}
                        {...provided.dragHandleProps}
                        style={style as React.CSSProperties | undefined}
                        onClick={(e) => {
                          if (!snapshot.isDragging)
                            setSelectedChildId(child.id);
                        }}
                      >
                        <ChildItemContextMenu
                          childId={child.id}
                          childData={child}
                          associatedParents={associatedParents}
                          config={{
                            ...config,
                            allParents: mappedParents,
                          }}
                        >
                          <motion.div
                            className={`mx-2 p-3 rounded-lg shadow-md cursor-grab bg-gradient-to-br ${
                              isSelected
                                ? config.theme?.parentGradient ||
                                  "from-cyan-400 to-teal-500 dark:from-cyan-600 dark:to-teal-700"
                                : snapshot.isDragging
                                  ? "scale-110 shadow-xl"
                                  : config.theme?.childGradient ||
                                    "from-purple-400 to-indigo-500 dark:from-purple-600 dark:to-indigo-700"
                            } ${isCreating ? "opacity-50 pointer-events-none" : ""}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                          >
                            <div className="flex items-center justify-between">
                              {renderEntityFields(
                                child,
                                config.childDisplayConfig,
                              )}
                              <AssociationPill
                                count={associatedParents.length}
                                text={
                                  associatedParents.length > 0
                                    ? `${associatedParents[0][config.parentDisplayConfig.primaryField] || config.parentDisplayConfig.fallbackPrimary || "Unnamed"}${
                                        associatedParents.length > 1
                                          ? ` +${associatedParents.length - 1}`
                                          : ""
                                      }`
                                    : "0"
                                }
                                tooltipText={
                                  associatedParents.length > 0
                                    ? associatedParents
                                        .map(
                                          (parent) =>
                                            parent[
                                              config.parentDisplayConfig
                                                .primaryField
                                            ] ||
                                            config.parentDisplayConfig
                                              .fallbackPrimary ||
                                            "Unnamed",
                                        )
                                        .join(", ")
                                    : "No associations"
                                }
                                parentId={
                                  associatedParents.length > 0
                                    ? associatedParents[0].id
                                    : undefined
                                }
                                childId={child.id}
                                parentData={
                                  associatedParents.length > 0
                                    ? associatedParents[0]
                                    : undefined
                                }
                                childData={child}
                                associatedParents={associatedParents}
                              />
                            </div>
                          </motion.div>
                        </ChildItemContextMenu>
                      </div>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
            {getGroupedChildrenByParent.unassociatedChildren.length > 0 && (
              <div className="p-2 mt-4">
                <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                  Unassociated {config.childLabel}
                </h3>
                <div className="space-y-2">
                  {getGroupedChildrenByParent.unassociatedChildren
                    .map((childId: string) =>
                      children.find((c: any) => c.id === childId),
                    )
                    .filter(Boolean)
                    .filter((child: any) =>
                      Object.values(child).some((value) =>
                        String(value)
                          .toLowerCase()
                          .includes(childSearch.toLowerCase()),
                      ),
                    )
                    .filter((child: any) =>
                      config.childFilterConfig
                        .find((f) => f.value === childFilter)
                        ?.filterFn(child, mappedParents),
                    )
                    .map((child: any) => (
                      <ChildItemContextMenu
                        key={`unassoc-${child.id}`}
                        childId={child.id}
                        childData={child}
                        associatedParents={[]}
                        config={{
                          ...config,
                          allParents: mappedParents,
                        }}
                      >
                        <motion.div
                          className="mx-2 p-3 rounded-lg shadow-md bg-gray-300 dark:bg-gray-700 opacity-75"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          {renderEntityFields(child, config.childDisplayConfig)}
                        </motion.div>
                      </ChildItemContextMenu>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default ChildColumn;
