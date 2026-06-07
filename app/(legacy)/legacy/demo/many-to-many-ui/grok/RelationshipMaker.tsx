// @ts-nocheck

"use client";

import React, { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "motion/react";
import { useCreateManyToMany } from "@/lib/redux/entity/hooks/useCreateManyToMany";
import { RELATIONSHIP_DEFINITIONS } from "@/app/entities/hooks/relationships/relationshipData";
import {
  AiModelDataOptional,
  AiEndpointDataOptional,
} from "@/types/AutomationSchemaTypes";

export const aiModelEndpointDef = RELATIONSHIP_DEFINITIONS.aiModelEndpoint;

const RelationshipMaker = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("All");
  const [providerModelFilter, setProviderModelFilter] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showAddModelModal, setShowAddModelModal] = useState(false);
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);

  const {
    allParentRecordsArray,
    allChildRecordsArray,
    getGroupedChildrenByParent,
    createManyToMany,
    deleteManyToMany,
  } = useCreateManyToMany(aiModelEndpointDef, {
    onSuccess: (recordId) => {
      console.log("Relationship created:", recordId);
    },
  });

  const models = allChildRecordsArray as AiModelDataOptional[];
  const allProviders = allParentRecordsArray as AiEndpointDataOptional[];
  const { groupedChildren, unassociatedChildren } = getGroupedChildrenByParent;

  const providers = allProviders.map((provider) => {
    const modelIds = groupedChildren[provider.id] || [];
    const providerModels = modelIds
      .map((modelId: string) => models.find((model) => model.id === modelId))
      .filter(Boolean) as AiModelDataOptional[];
    return {
      ...provider,
      models: providerModels,
    };
  });

  const isLoading =
    !allParentRecordsArray.length || !allChildRecordsArray.length;

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

  const filteredModels = filterItems(models, modelSearch).filter((model) => {
    const matchCount = providers.filter((p) =>
      p.models.some((m) => m.id === model.id),
    ).length;
    if (modelFilter === "Unassociated") return matchCount === 0;
    if (modelFilter === "1+ Matches") return matchCount > 0;
    return true; // "All"
  });

  const filteredProviders = filterItems(providers, providerSearch).filter(
    (provider) =>
      providerModelFilter
        ? provider.models.some((m) => m.id === providerModelFilter)
        : true,
  );

  const handleCreate = async (parentId: string, childId: string) => {
    setIsCreating(true);
    try {
      await createManyToMany(parentId, childId);
    } catch (error) {
      console.error("Create failed:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (parentId: string, childId: string) => {
    setIsCreating(true);
    try {
      await deleteManyToMany(parentId, childId);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const onDragEnd = (result: any) => {
    const { source, destination } = result;

    if (!destination || isCreating) return;

    const modelId = result.draggableId;
    const providerId = destination.droppableId;

    if (source.droppableId === "model-deck" && providerId !== "model-deck") {
      const provider = providers.find((p) => p.id === providerId);
      if (provider && !provider.models.some((m) => m.id === modelId)) {
        handleCreate(providerId, modelId);
      }
    }
  };

  const removeModelFromProvider = (providerId: string, modelId: string) => {
    handleDelete(providerId, modelId);
  };

  const truncateText = (text: string | undefined, maxLength: number = 50) =>
    text
      ? text.length > maxLength
        ? `${text.slice(0, maxLength)}...`
        : text
      : "";

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
        {/* Model Deck (Left Side) */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col">
          <div className="sticky top-0 z-10 p-2 bg-gray-100 dark:bg-gray-900 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">AI Models</h2>
              <button
                onClick={() => setShowAddModelModal(true)}
                className="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Add Model
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search models..."
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                className="flex-1 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">All</option>
                <option value="Unassociated">Unassociated</option>
                <option value="1+ Matches">1+ Matches</option>
              </select>
            </div>
          </div>
          <Droppable droppableId="model-deck" isDropDisabled={true}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-400 bg-gray-100 dark:bg-gray-900"
              >
                <div className="space-y-2">
                  {filteredModels.map((model, index) => (
                    <Draggable
                      key={model.id}
                      draggableId={model.id}
                      index={index}
                    >
                      {(provided, snapshot) => {
                        const { style, ...draggableProps } =
                          provided.draggableProps;
                        const associatedProviders = providers.filter((p) =>
                          p.models.some((m) => m.id === model.id),
                        );
                        const isSelected = selectedModelId === model.id;
                        return (
                          <div
                            ref={provided.innerRef}
                            {...draggableProps}
                            {...provided.dragHandleProps}
                            style={style as React.CSSProperties | undefined}
                            onClick={(e) => {
                              if (!snapshot.isDragging)
                                setSelectedModelId(model.id);
                            }}
                          >
                            <motion.div
                              className={`mx-2 p-3 rounded-lg shadow-md cursor-grab bg-gradient-to-br ${
                                isSelected
                                  ? "from-cyan-400 to-teal-500 dark:from-cyan-600 dark:to-teal-700"
                                  : snapshot.isDragging
                                    ? "scale-110 shadow-xl"
                                    : "from-purple-400 to-indigo-500 dark:from-purple-600 dark:to-indigo-700"
                              } ${isCreating ? "opacity-50 pointer-events-none" : ""}`}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.1 }}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="font-semibold">
                                    {model.commonName || "Unnamed"} (
                                    {model.name})
                                  </span>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {[
                                      model.modelClass,
                                      model.contextWindow
                                        ? `Context Window: ${model.contextWindow}`
                                        : "",
                                      model.maxTokens
                                        ? `Max Tokens: ${model.maxTokens.toLocaleString()}`
                                        : "",
                                      model.capabilities
                                        ? "Capablities: " + model.capabilities
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </p>
                                </div>
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    associatedProviders.length === 0
                                      ? "bg-orange-400 dark:bg-orange-600"
                                      : "bg-green-400 dark:bg-green-600"
                                  }`}
                                >
                                  {associatedProviders.length > 0
                                    ? `${associatedProviders[0].name || "Unnamed"}${
                                        associatedProviders.length > 1
                                          ? ` +${associatedProviders.length - 1}`
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
                {/* Unassociated Models */}
                {unassociatedChildren.length > 0 && (
                  <div className="p-2 mt-4">
                    <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400">
                      Unassociated Models
                    </h3>
                    <div className="space-y-2">
                      {unassociatedChildren
                        .map((modelId: string) =>
                          models.find((m) => m.id === modelId),
                        )
                        .filter(Boolean)
                        .filter((model) =>
                          Object.values(model!).some((value) =>
                            String(value)
                              .toLowerCase()
                              .includes(modelSearch.toLowerCase()),
                          ),
                        )
                        .filter((model) =>
                          modelFilter === "Unassociated" ||
                          modelFilter === "All"
                            ? true
                            : false,
                        )
                        .map((model) => (
                          <motion.div
                            key={`unassoc-${model!.id}`}
                            className="mx-2 p-3 rounded-lg shadow-md bg-gray-300 dark:bg-gray-700 opacity-75"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                          >
                            <span className="font-semibold">
                              {model!.commonName || "Unnamed"} ({model!.name})
                            </span>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {[
                                model!.modelClass,
                                model!.contextWindow
                                  ? `${model!.contextWindow} ctx`
                                  : "",
                                model!.maxTokens
                                  ? `${model!.maxTokens} tokens`
                                  : "",
                                model!.capabilities ? "Capable" : "",
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </p>
                          </motion.div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </div>

        {/* Provider Containers (Right Side) */}
        <div className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col">
          <div className="sticky top-0 z-10 p-2 bg-gray-100 dark:bg-gray-900 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Providers</h3>
              <button
                onClick={() => setShowAddProviderModal(true)}
                className="px-3 py-1 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Add Provider
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search providers..."
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                className="flex-1 p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={providerModelFilter}
                onChange={(e) => setProviderModelFilter(e.target.value)}
                className="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Models</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.commonName || "Unnamed"}
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
            {filteredProviders.map((provider) => (
              <Droppable key={provider.id} droppableId={provider.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`m-2 rounded-xl border transition-all bg-white bg-opacity-90 dark:bg-gray-800 dark:bg-opacity-80 backdrop-blur-md ${
                      snapshot.isDraggingOver && !isCreating
                        ? "border-indigo-400"
                        : snapshot.draggingFromThisWith &&
                            provider.models.some(
                              (m) => m.id === snapshot.draggingFromThisWith,
                            )
                          ? "border-yellow-400 opacity-75"
                          : selectedModelId &&
                              provider.models.some(
                                (m) => m.id === selectedModelId,
                              )
                            ? "border-cyan-500 shadow-cyan-500/50"
                            : "border-gray-700 dark:border-gray-700"
                    }`}
                  >
                    <div
                      className={`p-2 ${
                        selectedModelId &&
                        provider.models.some((m) => m.id === selectedModelId)
                          ? "bg-cyan-100 dark:bg-cyan-900"
                          : ""
                      }`}
                    >
                      <h3 className="text-lg font-semibold">
                        {provider.name || "Unnamed Provider"}
                      </h3>
                      {provider.companyDescription && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {truncateText(provider.companyDescription)}
                        </p>
                      )}
                    </div>
                    <div
                      className={`min-h-[80px] flex flex-wrap gap-2 p-2 rounded-lg ${
                        provider.models.length === 0 ? "animate-pulse" : ""
                      } bg-gray-200 dark:bg-gray-700`}
                    >
                      <AnimatePresence>
                        {provider.models.length === 0 && (
                          <motion.span
                            key={`empty-${provider.id}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-gray-400 p-2"
                          >
                            Drop a model here!
                          </motion.span>
                        )}
                        {provider.models.map((model) => (
                          <motion.div
                            key={`${provider.id}-${model.id}`}
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
                            <span>{model.commonName || "Unnamed"}</span>
                            <button
                              onClick={() =>
                                removeModelFromProvider(provider.id, model.id)
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

      {/* Placeholder Modals */}
      {showAddModelModal && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-textured p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">Add New Model</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Placeholder for model creation form
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModelModal(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAddModelModal(false)}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </motion.div>
      )}
      {showAddProviderModal && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="bg-textured p-6 rounded-lg shadow-xl w-96">
            <h3 className="text-lg font-bold mb-4">Add New Provider</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Placeholder for provider creation form
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowAddProviderModal(false)}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default RelationshipMaker;
