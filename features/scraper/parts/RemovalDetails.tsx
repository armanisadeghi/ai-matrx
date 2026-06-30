"use client";
import { detailsMap, typeMap } from "@/features/scraper/constants";
import { Checkbox } from "@/features/scraper/reusable/checkbox";
import { Button } from "@/components/ui/button";
import React, { useState, useMemo } from "react";

type FilterColumn = "type" | "details" | "remover";

type RemovalItem = {
  text: string;
  type: string;
  details: string;
  remover: string;
};

const RemovalDetails = ({ allRemovals }) => {
  const [selectedItem, setSelectedItem] = useState<RemovalItem | null>(null);
  const [sortColumn, setSortColumn] = useState("text");
  const [sortDirection, setSortDirection] = useState("asc");
  const [filterBlankText, setFilterBlankText] = useState(true);
  const [textFilter, setTextFilter] = useState("");
  const [filterModal, setFilterModal] = useState<FilterColumn | null>(null);
  const [filters, setFilters] = useState({
    type: new Set(),
    details: new Set(),
    remover: new Set(),
  });

  if (!allRemovals?.length) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No removal details available
      </div>
    );
  }

  const cleanText = (text) => text.replace(/\n+/g, " ").trim();

  const truncateText = (text, maxLength) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getDisplayValue = (value, map) => map[value] || value;

  const uniqueValues = (column) => {
    const values = new Set(
      allRemovals.map((item) =>
        getDisplayValue(item[column], column === "type" ? typeMap : detailsMap),
      ),
    );
    return Array.from(values);
  };

  const handleFilterChange = (column, value) => {
    const newFilters = { ...filters };
    if (newFilters[column].has(value)) {
      newFilters[column].delete(value);
    } else {
      newFilters[column].add(value);
    }
    setFilters(newFilters);
  };

  const filteredDetails = useMemo(() => {
    let data = [...allRemovals];

    if (filterBlankText) {
      data = data.filter((item) => cleanText(item.text).trim() !== "");
    }

    if (textFilter) {
      data = data.filter((item) =>
        cleanText(item.text).toLowerCase().includes(textFilter.toLowerCase()),
      );
    }

    if (filters.type.size > 0) {
      data = data.filter((item) =>
        filters.type.has(getDisplayValue(item.type, typeMap)),
      );
    }

    if (filters.details.size > 0) {
      data = data.filter((item) =>
        filters.details.has(getDisplayValue(item.details, detailsMap)),
      );
    }

    if (filters.remover.size > 0) {
      data = data.filter((item) => filters.remover.has(item.remover));
    }

    return data.sort((a, b) => {
      const getValue = (item, col) => {
        if (col === "text") return cleanText(item.text).toLowerCase();
        if (col === "remover") return item.remover.toLowerCase();
        return getDisplayValue(
          item[col],
          col === "type" ? typeMap : detailsMap,
        ).toLowerCase();
      };

      const valueA = getValue(a, sortColumn);
      const valueB = getValue(b, sortColumn);

      return sortDirection === "asc"
        ? valueA.localeCompare(valueB)
        : valueB.localeCompare(valueA);
    });
  }, [
    allRemovals,
    filterBlankText,
    textFilter,
    filters,
    sortColumn,
    sortDirection,
  ]);

  return (
    <div className="h-full w-full flex flex-col p-4">
      <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
        Removal Details
      </h3>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Checkbox
          checked={filterBlankText}
          onChange={() => setFilterBlankText(!filterBlankText)}
          label="Filter out blank text"
        />
        <div className="flex items-center">
          <label
            htmlFor="textFilter"
            className="mr-2 text-gray-800 dark:text-gray-200"
          >
            Search text:
          </label>
          <input
            id="textFilter"
            type="text"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            className="p-1 border border-gray-300 dark:border-gray-600 rounded bg-textured text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              <th
                className="w-9/12 border p-2 text-left cursor-pointer bg-gray-100 dark:bg-gray-700"
                onClick={() => handleSort("text")}
              >
                Text{" "}
                {sortColumn === "text" && (
                  <span className="text-sm">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
              </th>
              <th
                className="w-1/12 border p-2 text-left cursor-pointer bg-gray-100 dark:bg-gray-700"
                onClick={() => handleSort("type")}
              >
                Type{" "}
                {sortColumn === "type" && (
                  <span className="text-sm">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
                <button
                  className="ml-2 text-blue-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterModal("type");
                  }}
                >
                  Filter
                </button>
              </th>
              <th
                className="w-1/12 border p-2 text-left cursor-pointer bg-gray-100 dark:bg-gray-700"
                onClick={() => handleSort("details")}
              >
                Details{" "}
                {sortColumn === "details" && (
                  <span className="text-sm">
                    {sortDirection === "asc" ? "↓" : "↑"}
                  </span>
                )}
                <button
                  className="ml-2 text-blue-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterModal("details");
                  }}
                >
                  Filter
                </button>
              </th>
              <th
                className="w-1/12 border p-2 text-left cursor-pointer bg-gray-100 dark:bg-gray-700"
                onClick={() => handleSort("remover")}
              >
                Remover{" "}
                {sortColumn === "remover" && (
                  <span className="text-sm">
                    {sortDirection === "asc" ? "↑" : "↓"}
                  </span>
                )}
                <button
                  className="ml-2 text-blue-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFilterModal("remover");
                  }}
                >
                  Filter
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredDetails.map((item, index) => (
              <tr
                key={index}
                className={`${index % 2 === 0 ? "bg-gray-50 dark:bg-gray-800" : "bg-textured"} hover:bg-gray-100 dark:hover:bg-gray-700`}
              >
                <td
                  className="border p-2 cursor-pointer overflow-hidden text-ellipsis"
                  onClick={() => setSelectedItem(item)}
                  style={{ whiteSpace: "normal" }}
                >
                  {truncateText(cleanText(item.text), 200)}
                </td>
                <td className="border p-2 truncate">
                  {getDisplayValue(item.type, typeMap)}
                </td>
                <td className="border p-2 truncate">
                  {getDisplayValue(item.details, detailsMap)}
                </td>
                <td className="border p-2 truncate">{item.remover}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-textured p-4 rounded-md max-w-3xl w-full max-h-[80dvh] overflow-auto">
            <h2 className="text-xl font-bold mb-2">Full Text</h2>
            <p>
              <strong>Type:</strong>{" "}
              {getDisplayValue(selectedItem.type, typeMap)}
            </p>
            <p>
              <strong>Details:</strong>{" "}
              {getDisplayValue(selectedItem.details, detailsMap)}
            </p>
            <p>
              <strong>Remover:</strong> {selectedItem.remover}
            </p>
            <p>
              <strong>Text:</strong>
            </p>
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-md whitespace-pre-wrap">
              {selectedItem.text}
            </div>
            <button
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md"
              onClick={() => setSelectedItem(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {filterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-textured p-4 rounded-md max-w-md w-full">
            <h2 className="text-xl font-bold mb-2">Filter {filterModal}</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {uniqueValues(filterModal).map((value) => (
                <Checkbox
                  key={String(value)}
                  checked={filters[filterModal].has(value)}
                  onChange={() => handleFilterChange(filterModal, value)}
                  label={String(value)}
                />
              ))}
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFilterModal(null)}
              >
                Close
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newFilters = { ...filters, [filterModal]: new Set() };
                  setFilters(newFilters);
                  setFilterModal(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemovalDetails;
