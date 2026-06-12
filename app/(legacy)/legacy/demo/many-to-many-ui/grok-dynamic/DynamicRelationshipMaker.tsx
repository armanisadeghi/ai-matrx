// @ts-nocheck

"use client";

import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "motion/react";
import { useCreateManyToMany } from "@/lib/redux/entity/hooks/useCreateManyToMany";
import { EntityDisplayConfig, RelationshipMakerConfig } from "./definitions";

interface DynamicRelationshipMakerProps {
  config: RelationshipMakerConfig;
}

const DynamicRelationshipMaker = ({
  config,
}: DynamicRelationshipMakerProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [childSearch, setChildSearch] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [childFilter, setChildFilter] = useState(
    config.childFilterConfig[0].value,
  );
  const [parentFilter, setParentFilter] = useState(
    config.parentFilterConfig?.[0]?.value || "",
  );
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showAddParentModal, setShowAddParentModal] = useState(false);
  const [showAdditionalFieldsModal, setShowAdditionalFieldsModal] =
    useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [selectedChildIdForAdditional, setSelectedChildIdForAdditional] =
    useState<string | null>(null);
  const [additionalFieldsValues, setAdditionalFieldsValues] = useState<
    Record<string, any>
  >({});

  const {
    allParentRecordsArray,
    allChildRecordsArray,
    getGroupedChildrenByParent,
    createManyToMany,
    deleteManyToMany,
  } = useCreateManyToMany(config.relationshipDef, {
    onSuccess: (recordId) => {
      console.log("Relationship created:", recordId);
    },
  });

  // Map parent and child based on config.parentEntity and config.childEntity
  const parents =
    config.parentEntity === "entityOne"
      ? allParentRecordsArray
      : allChildRecordsArray;
  const children =
    config.childEntity === "entityOne"
      ? allParentRecordsArray
      : allChildRecordsArray;

  const mappedParents = parents.map((parent: any) => {
    const childIds =
      getGroupedChildrenByParent.groupedChildren[parent.id] || [];
    const parentChildren = childIds
      .map((childId: string) => {
        const child = children.find((child: any) => child.id === childId);
        return {
          ...child,
          additionalFields: {}, // Placeholder until relationships data is available
        };
      })
      .filter(Boolean);
    return {
      ...parent,
      models: parentChildren,
    };
  });

  const isLoading = !parents.length || !children.length;

  // Filter functions
  const filterItems = (items: any[], query: string) => {
    if (!query) return items;
    const lowerQuery = query.toLowerCase();
    return items.filter((item) =>
      Object.values(item).some((value) =>
        String(value).toLowerCase().includes(lowerQuery),
      ),
    );
  };

  const filteredChildren = filterItems(children, childSearch).filter((child) =>
    config.childFilterConfig
      .find((f) => f.value === childFilter)
      ?.filterFn(child, mappedParents),
  );

  const filteredParents = filterItems(mappedParents, parentSearch).filter(
    (parent) =>
      parentFilter
        ? parent.models.some((m: any) => m.id === parentFilter)
        : (config.parentFilterConfig
            ?.find((f) => f.value === parentFilter)
            ?.filterFn(parent, children) ?? true),
  );

  const handleCreate = async (
    parentId: string,
    childId: string,
    additionalFields?: Record<string, any>,
  ) => {
    setIsCreating(true);
    try {
      // Adjust parentId and childId based on entity assignments
      const adjustedParentId =
        config.parentEntity === "entityOne" ? parentId : childId;
      const adjustedChildId =
        config.childEntity === "entityOne" ? parentId : childId;
      await createManyToMany(
        adjustedParentId,
        adjustedChildId,
        additionalFields,
      );
    } catch (error) {
      console.error("Create failed:", error);
    } finally {
      setIsCreating(false);
      setShowAdditionalFieldsModal(false);
      setAdditionalFieldsValues({});
    }
  };

  const handleDelete = async (parentId: string, childId: string) => {
    setIsCreating(true);
    try {
      const adjustedParentId =
        config.parentEntity === "entityOne" ? parentId : childId;
      const adjustedChildId =
        config.childEntity === "entityOne" ? parentId : childId;
      await deleteManyToMany(adjustedParentId, adjustedChildId);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const onDragEnd = (result: any) => {
    const { source, destination } = result;

    if (!destination || isCreating) return;

    const childId = result.draggableId;
    const parentId = destination.droppableId;

    if (source.droppableId === "child-deck" && parentId !== "child-deck") {
      const parent = mappedParents.find((p: any) => p.id === parentId);
      if (parent && !parent.models.some((m: any) => m.id === childId)) {
        if (config.additionalFieldsConfig?.length) {
          setSelectedParentId(parentId);
          setSelectedChildIdForAdditional(childId);
          // Prefill order with the next available number
          const nextOrder = parent.models.length + 1;
          setAdditionalFieldsValues({
            order: nextOrder,
          });
          setShowAdditionalFieldsModal(true);
        } else {
          handleCreate(parentId, childId);
        }
      }
    }
  };

  const removeChildFromParent = (parentId: string, childId: string) => {
    handleDelete(parentId, childId);
  };

  const renderEntityFields = (entity: any, config: EntityDisplayConfig) => {
    const primary =
      entity[config.primaryField] || config.fallbackPrimary || "Unnamed";
    const secondary = config.secondaryFields
      ?.map(({ field, label, format }) =>
        entity[field]
          ? `${label || field}: ${format ? format(entity[field]) : entity[field]}`
          : "",
      )
      .filter(Boolean)
      .join(" • ");

    return (
      <div>
        <span className="font-semibold">{primary}</span>
        {secondary && (
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {secondary}
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-200">
        <motion.div
          className="w-12 h-12 border-4 border-t-indigo-500 border-gray-300 rounded-full animate-spin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-200">
      <DragDropContext onDragEnd={onDragEnd}>
        {/* Child Deck (Left Side) */}
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
                    <Draggable
                      key={child.id}
                      draggableId={child.id}
                      index={index}
                    >
                      {(provided, snapshot) => {
                        const { style, ...draggableProps } =
                          provided.draggableProps;
                        const associatedParents = mappedParents.filter(
                          (p: any) =>
                            p.models.some((m: any) => m.id === child.id),
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
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    associatedParents.length === 0
                                      ? "bg-orange-400 dark:bg-orange-600"
                                      : "bg-green-400 dark:bg-green-600"
                                  }`}
                                >
                                  {associatedParents.length > 0
                                    ? `${associatedParents[0][config.parentDisplayConfig.primaryField] || config.parentDisplayConfig.fallbackPrimary || "Unnamed"}${
                                        associatedParents.length > 1
                                          ? ` +${associatedParents.length - 1}`
                                          : ""
                                      }`
                                    : "0"}
                                </span>
                              </div>
                            </motion.div>
                          </div>
                        );
                      }}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
                {/* Unassociated Children */}
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
                          <motion.div
                            key={`unassoc-${child.id}`}
                            className="mx-2 p-3 rounded-lg shadow-md bg-gray-300 dark:bg-gray-700 opacity-75"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            {renderEntityFields(
                              child,
                              config.childDisplayConfig,
                            )}
                          </motion.div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>

        {/* Parent Containers (Right Side) */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col">
          <div className="sticky top-0 z-10 p-2 bg-gray-100 dark:bg-gray-900 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">{config.parentLabel}</h3>
              <button
                onClick={() => setShowAddParentModal(true)}
                className="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                {config.addParentButtonLabel}
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={`Search ${config.parentLabel.toLowerCase()}...`}
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                className="flex-1 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={parentFilter}
                onChange={(e) => setParentFilter(e.target.value)}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {config.parentFilterConfig?.map(({ label, value }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {children.map((child: any) => (
                  <option key={child.id} value={child.id}>
                    {child[config.childDisplayConfig.primaryField] || "Unnamed"}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-400">
            {isCreating && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                <motion.div
                  className="w-12 h-12 border-4 border-t-indigo-500 border-gray-300 rounded-full animate-spin"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                />
              </div>
            )}
            {filteredParents.map((parent: any) => (
              <Droppable key={parent.id} droppableId={parent.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`m-2 rounded-xl border transition-all bg-white bg-opacity-90 dark:bg-gray-800 dark:bg-opacity-80 backdrop-blur-md ${
                      snapshot.isDraggingOver && !isCreating
                        ? "border-indigo-400"
                        : snapshot.draggingFromThisWith &&
                            parent.models.some(
                              (m: any) =>
                                m.id === snapshot.draggingFromThisWith,
                            )
                          ? "border-yellow-400 opacity-75"
                          : selectedChildId &&
                              parent.models.some(
                                (m: any) => m.id === selectedChildId,
                              )
                            ? "border-cyan-500 shadow-cyan-500/50"
                            : "border-gray-700 dark:border-gray-700"
                    }`}
                  >
                    <div
                      className={`p-2 ${
                        selectedChildId &&
                        parent.models.some((m: any) => m.id === selectedChildId)
                          ? "bg-cyan-100 dark:bg-cyan-900"
                          : ""
                      }`}
                    >
                      {renderEntityFields(parent, config.parentDisplayConfig)}
                    </div>
                    <div
                      className={`min-h-[80px] flex flex-wrap gap-2 p-2 rounded-lg ${
                        parent.models.length === 0 ? "animate-pulse" : ""
                      } bg-gray-200 dark:bg-gray-700`}
                    >
                      <AnimatePresence>
                        {parent.models.length === 0 && (
                          <motion.span
                            key={`empty-${parent.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-gray-400 p-2"
                          >
                            Drop a {config.childLabel.toLowerCase()} here!
                          </motion.span>
                        )}
                        {parent.models.map((child: any) => (
                          <motion.div
                            key={`${parent.id}-${child.id}`}
                            className="px-3 py-1 rounded-full flex items-center gap-2 bg-indigo-400 dark:bg-indigo-500"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 300,
                              damping: 20,
                            }}
                          >
                            <span>
                              {child[config.childDisplayConfig.primaryField] ||
                                "Unnamed"}
                            </span>
                            {child.additionalFields?.order && (
                              <span className="text-xs bg-indigo-600 dark:bg-indigo-800 rounded-full px-2 py-0.5">
                                Order: {child.additionalFields.order}
                              </span>
                            )}
                            <button
                              onClick={() =>
                                removeChildFromParent(parent.id, child.id)
                              }
                              className="w-4 h-4 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                              disabled={isCreating}
                            >
                              <span className="text-xs">×</span>
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </div>
      </DragDropContext>

      {/* Add Child Modal */}
      {showAddChildModal && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-textured p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">
              {config.addChildButtonLabel}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = Object.fromEntries(formData);
                config
                  .onCreateChild?.(data)
                  .then(() => setShowAddChildModal(false));
              }}
            >
              {config.childSchema.map(
                ({ field, label, type, options, required }) => (
                  <div key={field} className="mb-4">
                    <label className="block text-sm font-medium">
                      {label || field}
                    </label>
                    {type === "select" ? (
                      <select
                        name={field}
                        required={required}
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      >
                        {options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type}
                        name={field}
                        required={required}
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      />
                    )}
                  </div>
                ),
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddChildModal(false)}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* Add Parent Modal */}
      {showAddParentModal && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-textured p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">
              {config.addParentButtonLabel}
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = Object.fromEntries(formData);
                config
                  .onCreateParent?.(data)
                  .then(() => setShowAddParentModal(false));
              }}
            >
              {config.parentSchema.map(
                ({ field, label, type, options, required }) => (
                  <div key={field} className="mb-4">
                    <label className="block text-sm font-medium">
                      {label || field}
                    </label>
                    {type === "select" ? (
                      <select
                        name={field}
                        required={required}
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      >
                        {options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type}
                        name={field}
                        required={required}
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      />
                    )}
                  </div>
                ),
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddParentModal(false)}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}

      {/* Additional Fields Modal */}
      {showAdditionalFieldsModal && config.additionalFieldsConfig && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-textured p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">Additional Fields</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                const data = Object.fromEntries(formData);
                handleCreate(
                  selectedParentId!,
                  selectedChildIdForAdditional!,
                  data,
                );
              }}
            >
              {config.additionalFieldsConfig.map(
                ({ field, label, type, options, required }) => (
                  <div key={field} className="mb-4">
                    <label className="block text-sm font-medium">
                      {label || field}
                    </label>
                    {type === "select" ? (
                      <select
                        name={field}
                        required={required}
                        value={additionalFieldsValues[field] || ""}
                        onChange={(e) =>
                          setAdditionalFieldsValues({
                            ...additionalFieldsValues,
                            [field]: e.target.value,
                          })
                        }
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      >
                        {options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={type}
                        name={field}
                        required={required}
                        value={additionalFieldsValues[field] || ""}
                        onChange={(e) =>
                          setAdditionalFieldsValues({
                            ...additionalFieldsValues,
                            [field]:
                              type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        className="w-full p-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                      />
                    )}
                  </div>
                ),
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdditionalFieldsModal(false);
                    setAdditionalFieldsValues({});
                  }}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-500 text-white rounded-lg"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default DynamicRelationshipMaker;
