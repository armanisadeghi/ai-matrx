import React from "react";
import {PlaceholdersVanishingSearchInput} from "@/components/matrx/search-input/PlaceholdersVanishingSearchInput";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import MatrxTooltip from "@/components/matrx/MatrxTooltip";
import {Button} from "@/components/ui/button";
import {Plus, Settings} from "lucide-react";

interface TableTopOptionsProps {
    columnNames: string[];
    handleSearchChange: (searchValue: string) => void;
    pageSize: number;
    setPageSize: (size: number) => void;
    handleAdd: () => void;
    setColumnSettingsOpen: (open: boolean) => void;
    columnSettingsOpen: boolean;
}

const TableTopOptions: React.FC<TableTopOptionsProps> = ({
                                                             columnNames,
                                                             handleSearchChange,
                                                             pageSize,
                                                             setPageSize,
                                                             handleAdd,
                                                             setColumnSettingsOpen,
                                                             columnSettingsOpen,
                                                         }) => {
    return (
        <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:justify-between sm:items-center">
            <PlaceholdersVanishingSearchInput
                columnNames={columnNames}
                onSearchChange={handleSearchChange}
                className="w-full sm:w-1/3"
            />

            <div className="flex flex-col space-y-4 sm:space-y-0 sm:flex-row sm:items-center">
                <div className="flex items-center space-x-2 sm:mr-4">
                    <span className="text-muted-foreground text-sm">Rows:</span>
                    <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => setPageSize(Number(value))}
                    >
                        <SelectTrigger className="w-24 bg-card text-card-foreground border-input text-sm">
                            <SelectValue placeholder="Rows"/>
                        </SelectTrigger>
                        <SelectContent>
                            {[5, 10, 25, 50, 100].map((size) => (
                                <SelectItem key={size} value={size.toString()}>
                                    {size}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:space-x-2">
                    <MatrxTooltip content="Add a new item" placement="bottom" offset={10}>
                        <Button
                            icon={<Plus/>}
                            variant="primary"
                            onClick={handleAdd}
                        >
                            <span>Add New</span>
                        </Button>
                    </MatrxTooltip>
                    <MatrxTooltip content="Column settings" placement="bottom" offset={10}>
                        <Button
                            icon={<Settings/>}
                            variant="primary"
                            onClick={() => setColumnSettingsOpen(!columnSettingsOpen)}
                        >
                            <span>Columns</span>
                        </Button>
                    </MatrxTooltip>
                </div>
            </div>
        </div>
    );
};

export default TableTopOptions;

