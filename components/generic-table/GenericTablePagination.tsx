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
import { cn } from "@/lib/utils";

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
  const compactButtonClass =
    "relative isolate h-11 w-11 min-w-11 border-0 bg-transparent p-0 text-xs shadow-none before:absolute before:inset-1.5 before:z-0 before:rounded-md before:border before:border-border before:bg-card before:content-[''] hover:bg-transparent hover:before:bg-accent disabled:bg-transparent disabled:before:opacity-40 [&_svg]:relative [&_svg]:z-10 lg:h-7 lg:min-h-7 lg:w-7 lg:min-w-7 lg:border lg:border-input lg:bg-background lg:before:hidden lg:hover:bg-accent";
  const compactActiveButtonClass =
    "text-primary-foreground before:border-primary before:bg-primary hover:before:bg-primary/90 lg:border-primary lg:bg-primary lg:hover:bg-primary/90";

  const containerClass = cn(
    "w-full items-center border-t border-border",
    layoutType === "grid"
      ? "grid grid-cols-[auto_minmax(0,1fr)_auto]"
      : "flex flex-nowrap justify-between",
    compact
      ? "h-11 gap-0 px-0 py-0 lg:h-8"
      : "gap-1 px-2 py-1 sm:gap-4 sm:px-3",
    className,
    containerClassName,
  );

  return (
    <div data-matrx-table-footer className={containerClass}>
      {/* Items Per Page Select */}
      {showItemsPerPageSelect && (
        <div
          className={cn(
            "flex min-w-0 justify-start",
            !compact && "sm:p-1",
            selectContainerClassName,
          )}
        >
          <Select
            value={itemsPerPage.toString()}
            onValueChange={(value) => onItemsPerPageChange(parseInt(value))}
          >
            <SelectTrigger
              aria-label="Rows per page"
              className={cn(
                "focus:ring-0",
                compact
                  ? "relative isolate h-11 w-14 border-0 bg-transparent px-2 text-xs before:absolute before:inset-x-1 before:inset-y-1.5 before:z-0 before:rounded-md before:border before:border-border before:bg-card before:content-[''] hover:before:bg-accent [&>*]:relative [&>*]:z-10 lg:h-7 lg:min-h-7 lg:w-16 lg:border lg:border-input lg:bg-background lg:px-2 lg:before:hidden"
                  : "h-8 w-[3.75rem] text-xs sm:w-36 sm:text-sm",
              )}
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

      <div
        className={cn("flex min-w-0 justify-center", infoContainerClassName)}
      >
        {/* Page Info - only show if not hidden But always show the div. */}
        {showPageInfo && !hideEntriesInfo && (
          <>
            <span className="truncate text-[10px] tabular-nums text-muted-foreground sm:hidden">
              {startItem}-{endItem} / {totalItems}
            </span>
            <span
              className={`hidden whitespace-nowrap ${
                compact ? "text-xs" : "text-sm"
              } text-muted-foreground sm:inline`}
            >
              {formatLabel(startItem, endItem, totalItems)}
            </span>
          </>
        )}
      </div>

      {/* Page Controls */}
      {showPageControls && (
        <div
          className={cn(
            "flex min-w-0 items-center justify-end",
            compact ? "gap-0" : "gap-0.5 sm:gap-1",
            controlsContainerClassName,
          )}
        >
          <Button
            variant="outline"
            size={buttonSize}
            aria-label="First page"
            title="First page"
            onClick={() => onPageChange(1)}
            disabled={isFirstPageDisabled}
            className={cn(
              "hidden sm:inline-flex",
              compact ? compactButtonClass : "h-8 w-8 p-0",
              navButtonClassName,
            )}
          >
            <ChevronsLeft className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Previous page"
            title="Previous page"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={isFirstPageDisabled}
            className={cn(
              compact ? compactButtonClass : "h-8 w-8 p-0",
              navButtonClassName,
            )}
          >
            <ChevronLeft className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>

          {getPageNumbers(3).map((page) => (
            <Button
              key={`mobile-${page}`}
              variant={currentPage === page ? "default" : "outline"}
              size={buttonSize}
              aria-label={`Page ${page}`}
              aria-current={currentPage === page ? "page" : undefined}
              onClick={() => onPageChange(page)}
              className={cn(
                "sm:hidden",
                page === currentPage
                  ? "inline-flex"
                  : "hidden min-[360px]:inline-flex",
                compact ? compactButtonClass : "h-8 w-8 p-0",
                compact && page === currentPage && compactActiveButtonClass,
                page === currentPage
                  ? pageActiveButtonClassName
                  : pageButtonClassName,
              )}
            >
              <span className="relative z-10">{page}</span>
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
              className={cn(
                "hidden sm:inline-flex",
                compact ? compactButtonClass : "h-8 w-8 p-0",
                compact && page === currentPage && compactActiveButtonClass,
                currentPage === page
                  ? pageActiveButtonClassName
                  : pageButtonClassName,
              )}
            >
              <span className="relative z-10">{page}</span>
            </Button>
          ))}

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Next page"
            title="Next page"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={isLastPageDisabled}
            className={cn(
              compact ? compactButtonClass : "h-8 w-8 p-0",
              navButtonClassName,
            )}
          >
            <ChevronRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>

          <Button
            variant="outline"
            size={buttonSize}
            aria-label="Last page"
            title="Last page"
            onClick={() => onPageChange(totalPages)}
            disabled={isLastPageDisabled}
            className={cn(
              "hidden sm:inline-flex",
              compact ? compactButtonClass : "h-8 w-8 p-0",
              navButtonClassName,
            )}
          >
            <ChevronsRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>
        </div>
      )}
    </div>
  );
}
