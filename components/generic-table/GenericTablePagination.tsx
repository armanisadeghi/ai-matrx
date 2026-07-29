import { Button } from "@/components/ui/button";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronsRight,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface GenericTablePaginationProps {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (items: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  showItemsPerPageSelect?: boolean;
  showPageInfo?: boolean;
  showPageControls?: boolean;
  maxPagesToShow?: number;
  containerClassName?: string;
  selectContainerClassName?: string;
  infoContainerClassName?: string;
  controlsContainerClassName?: string;
  pageButtonClassName?: string;
  pageActiveButtonClassName?: string;
  navButtonClassName?: string;
  showAllOption?: boolean;
  layoutType?: "grid" | "flex";
  labelFormat?: (start: number, end: number, total: number) => string;
  compact?: boolean;
  hideEntriesInfo?: boolean;
}

export default function GenericTablePagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
  pageSizeOptions = [5, 10, 25, 50, 100],
  className = "",
  showItemsPerPageSelect = true,
  showPageInfo = true,
  showPageControls = true,
  maxPagesToShow = 5,
  containerClassName = "",
  selectContainerClassName = "",
  infoContainerClassName = "",
  controlsContainerClassName = "",
  pageButtonClassName = "",
  pageActiveButtonClassName = "",
  navButtonClassName = "",
  showAllOption = true,
  layoutType = "grid",
  labelFormat,
  compact = false,
  hideEntriesInfo = false,
}: GenericTablePaginationProps) {
  const availablePageSizes = pageSizeOptions.includes(itemsPerPage)
    ? pageSizeOptions
    : [...pageSizeOptions, itemsPerPage].sort((a, b) => a - b);

  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const getPageNumbers = (limit = maxPagesToShow) => {
    let startPage = Math.max(1, currentPage - Math.floor(limit / 2));
    const endPage = Math.min(totalPages, startPage + limit - 1);
    startPage = Math.max(1, endPage - limit + 1);
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => startPage + i,
    );
  };

  const isFirstPageDisabled = currentPage <= 1;
  const isLastPageDisabled = currentPage >= totalPages;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const defaultLabelFormat = (start: number, end: number, total: number) => {
    return compact
      ? `${start}-${end} of ${total}`
      : `Showing ${start} to ${end} of ${total} entries`;
  };

  const formatLabel = labelFormat || defaultLabelFormat;

  const buttonSize = compact ? "sm" : "icon";
  const buttonWidth = compact ? "w-7 sm:w-6" : "w-8";
  const buttonHeight = compact ? "h-7 sm:h-6" : "h-8";
  const buttonPadding = compact ? "p-0 text-xs" : "p-0";

  const containerClass =
    layoutType === "grid"
      ? `grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 sm:gap-4 w-full border-t border-gray-200 dark:border-gray-600 px-2 sm:px-3 py-1 ${className} ${containerClassName}`
      : `flex flex-nowrap items-center justify-between gap-1 sm:gap-2 w-full border-t border-gray-200 dark:border-gray-600 px-2 sm:px-3 py-1 ${className} ${containerClassName}`;

  return (
    <div className={containerClass}>
      {/* Items Per Page Select */}
      {showItemsPerPageSelect && (
        <div
          className={`flex min-w-0 justify-start sm:p-1 ${selectContainerClassName}`}
        >
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value) => onItemsPerPageChange(parseInt(value))}
          >
            <SelectTrigger
              aria-label="Rows per page"
              className={`${
                compact
                  ? "h-7 w-[3.75rem] text-xs sm:h-6 sm:w-20"
                  : "h-8 w-[3.75rem] text-xs sm:w-36 sm:text-sm"
              } focus:ring-0`}
            >
              <SelectValue placeholder={itemsPerPage.toString()} />
            </SelectTrigger>
            <SelectContent>
              {availablePageSizes.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
              {showAllOption &&
                totalItems > Math.max(...availablePageSizes) && (
                  <SelectItem value={totalItems.toString()}>All</SelectItem>
                )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={`flex min-w-0 justify-center ${infoContainerClassName}`}>
        {/* Page Info - only show if not hidden But always show the div. */}
        {showPageInfo && !hideEntriesInfo && (
          <>
            <span className="truncate text-[10px] tabular-nums text-gray-600 dark:text-gray-400 sm:hidden">
              {startItem}-{endItem} / {totalItems}
            </span>
            <span
              className={`hidden whitespace-nowrap ${
                compact ? "text-xs" : "text-sm"
              } text-gray-600 dark:text-gray-400 sm:inline`}
            >
              {formatLabel(startItem, endItem, totalItems)}
            </span>
          </>
        )}
      </div>

      {/* Page Controls */}
      {showPageControls && (
        <div
          className={`flex min-w-0 items-center justify-end gap-0.5 sm:gap-1 ${controlsContainerClassName}`}
        >
          <Button
            variant="outline"
            size={buttonSize}
            aria-label="First page"
            title="First page"
            onClick={() => onPageChange(1)}
            disabled={isFirstPageDisabled}
            className={`hidden ${buttonWidth} ${buttonHeight} sm:inline-flex ${navButtonClassName}`}
          >
            <ChevronsLeft className={`${compact ? "h-3 w-3" : "h-4 w-4"}`} />
          </Button>

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Previous page"
            title="Previous page"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={isFirstPageDisabled}
            className={`${buttonWidth} ${buttonHeight} ${navButtonClassName}`}
          >
            <ChevronLeft className={`${compact ? "h-3 w-3" : "h-4 w-4"}`} />
          </Button>

          {getPageNumbers(3).map((page) => (
            <Button
              key={`mobile-${page}`}
              variant={currentPage === page ? "default" : "outline"}
              size={buttonSize}
              aria-label={`Page ${page}`}
              aria-current={currentPage === page ? "page" : undefined}
              onClick={() => onPageChange(page)}
              className={`${buttonWidth} ${buttonHeight} ${buttonPadding} sm:hidden ${
                page === currentPage ? "" : "hidden min-[360px]:inline-flex"
              } ${
                currentPage === page
                  ? pageActiveButtonClassName
                  : pageButtonClassName
              }`}
            >
              {page}
            </Button>
          ))}

          {getPageNumbers().map((page) => (
            <Button
              key={`desktop-${page}`}
              variant={currentPage === page ? "default" : "outline"}
              size={buttonSize}
              aria-label={`Page ${page}`}
              aria-current={currentPage === page ? "page" : undefined}
              onClick={() => onPageChange(page)}
              className={`hidden ${buttonWidth} ${buttonHeight} ${buttonPadding} sm:inline-flex ${
                currentPage === page
                  ? pageActiveButtonClassName
                  : pageButtonClassName
              }`}
            >
              {page}
            </Button>
          ))}

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Next page"
            title="Next page"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={isLastPageDisabled}
            className={`${buttonWidth} ${buttonHeight} ${navButtonClassName}`}
          >
            <ChevronRight className={`${compact ? "h-3 w-3" : "h-4 w-4"}`} />
          </Button>

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Last page"
            title="Last page"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastPageDisabled}
            className={`hidden ${buttonWidth} ${buttonHeight} sm:inline-flex ${navButtonClassName}`}
          >
            <ChevronsRight className={`${compact ? "h-3 w-3" : "h-4 w-4"}`} />
          </Button>
        </div>
      )}
    </div>
  );
}
