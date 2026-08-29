"use client";

import { useState, useMemo } from "react";
import type { UserList } from "../types";
import { matchesSearch } from "@ai-matrx/kit/search-scoring";

export function useListsTableState(lists: UserList[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return lists;
    return lists.filter((l) =>
      matchesSearch(l, searchTerm, [
        { get: (x) => x.list_name, weight: "title" },
        { get: (x) => x.description, weight: "body" },
      ]),
    );
  }, [lists, searchTerm]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      if (sortBy === "list_name") {
        aVal = a.list_name.toLowerCase();
        bVal = b.list_name.toLowerCase();
      } else if (sortBy === "item_count") {
        aVal = a.item_count ?? 0;
        bVal = b.item_count ?? 0;
      } else if (sortBy === "group_count") {
        aVal = a.group_count ?? 0;
        bVal = b.group_count ?? 0;
      } else if (sortBy === "created_at") {
        aVal = a.created_at;
        bVal = b.created_at;
      } else if (sortBy === "updated_at") {
        aVal = a.updated_at ?? "";
        bVal = b.updated_at ?? "";
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortBy, sortDirection]);

  const totalItems = sortedItems.length;
  const totalPages =
    itemsPerPage === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));

  const paginatedItems = useMemo(() => {
    if (itemsPerPage === 0) return sortedItems;
    const start = (safePage - 1) * itemsPerPage;
    return sortedItems.slice(start, start + itemsPerPage);
  }, [sortedItems, safePage, itemsPerPage]);

  const handleSortChange = (field: string) => {
    if (field === sortBy) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleItemsPerPageChange = (n: number) => {
    setItemsPerPage(n);
    setCurrentPage(1);
  };

  return {
    searchTerm,
    handleSearchChange,
    sortBy,
    sortDirection,
    handleSortChange,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    handleItemsPerPageChange,
    filteredItems,
    paginatedItems,
    totalItems,
  };
}
