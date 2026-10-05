import React from 'react';
import {ArrowLeftToLine, ArrowRightToLine, MoveLeft, MoveRight} from 'lucide-react';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Button} from "@/components/ui/button";

interface MatrixPaginationProps {
    totalCount: number;
    itemsPerPage: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (itemsPerPage: number) => void;
    className?: string;
    itemsPerPageOptions?: number[];
}

export const MatrixPagination: React.FC<MatrixPaginationProps> = (
    {
        totalCount,
        itemsPerPage,
        currentPage,
        onPageChange,
        onItemsPerPageChange,
        className = '',
        itemsPerPageOptions = [10, 25, 50, 100],
    }) => {
    const totalPages = Math.ceil(totalCount / itemsPerPage);

    const goToPage = (page: number) => {
        onPageChange(Math.max(1, Math.min(page, totalPages)));
    };

    const renderPageNumbers = () => {
        const pageNumbers: React.ReactElement[] = [];
        const showPages = 5;

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, startPage + showPages - 1);

        if (endPage - startPage + 1 < showPages) {
            startPage = Math.max(1, endPage - showPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pageNumbers.push(
                <Button
                    key={i}
                    variant={currentPage === i ? "primary" : "outline"}
                    aria-current={currentPage === i ? "page" : undefined}
                    onClick={() => goToPage(i)}
                >
                    {i}
                </Button>
            );
        }

        if (endPage < totalPages - 1) {
            pageNumbers.push(<span key="ellipsis" className="mx-1">...</span>);
        }

        if (endPage < totalPages) {
            pageNumbers.push(
                <Button
                    key={totalPages}
                    variant={currentPage === totalPages ? "primary" : "outline"}
                    aria-current={currentPage === totalPages ? "page" : undefined}
                    onClick={() => goToPage(totalPages)}
                >
                    {totalPages}
                </Button>
            );
        }

        return pageNumbers;
    };

    return (
        <div className={`flex items-center justify-between p-4 bg-background text-foreground rounded-lg ${className}`}>
            <div className="flex items-center space-x-4">
                <span className="text-sm">Rows per page:</span>
                <Select
                    value={itemsPerPage.toString()}
                    onValueChange={(value) => onItemsPerPageChange(parseInt(value, 10))}
                >
                    <SelectTrigger className="w-[70px]">
                        <SelectValue placeholder={itemsPerPage.toString()}/>
                    </SelectTrigger>
                    <SelectContent>
                        {itemsPerPageOptions.map((option) => (
                            <SelectItem key={option} value={option.toString()}>
                                {option}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="text-sm">
                    {`${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount}`}
                </span>
            </div>

            <div className="flex-grow"></div>
            {/* Empty space to ensure proper spacing */}

            <div className="flex items-center space-x-2">
                <Button
                    icon={<ArrowLeftToLine/>} aria-label="First Page"
                    variant="outline"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    title="First Page"
                />
                <Button
                    icon={<MoveLeft/>} aria-label="Previous Page"
                    variant="outline"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    title="Previous Page"
                />
                {renderPageNumbers()}
                <Button
                    icon={<MoveRight/>} aria-label="Next Page"
                    variant="outline"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    title="Next Page"
                />
                <Button
                    icon={<ArrowRightToLine/>} aria-label="Last Page"
                    variant="outline"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    title="Last Page"
                />
            </div>
        </div>
    );
};
