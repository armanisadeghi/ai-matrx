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
                    variant={currentPage === i ? "default" : "outline"}
                    size="icon"
                    onClick={() => goToPage(i)}
                    className="w-8 h-8 mx-1"
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
                    variant={currentPage === totalPages ? "default" : "outline"}
                    size="icon"
                    onClick={() => goToPage(totalPages)}
                    className="w-8 h-8 mx-1"
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
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    title="First Page"
                >
                    <ArrowLeftToLine className="h-4 w-4"/>
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    title="Previous Page"
                >
                    <MoveLeft className="h-4 w-4"/>
                </Button>
                {renderPageNumbers()}
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    title="Next Page"
                >
                    <MoveRight className="h-4 w-4"/>
                </Button>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    title="Last Page"
                >
                    <ArrowRightToLine className="h-4 w-4"/>
                </Button>
            </div>
        </div>
    );
};
