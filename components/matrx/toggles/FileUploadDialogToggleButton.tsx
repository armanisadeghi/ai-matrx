import React, { useState } from "react";
import ToggleButton from "./ToggleButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileUploadWithStorage } from "@/components/ui/file-upload/FileUploadWithStorage";
import { EnhancedFileDetails } from "@/utils/file-operations/constants";

interface FileUploadDialogFileManager {
    addFiles: (files: Array<{ url: string; type: string; details?: EnhancedFileDetails }>) => Promise<void>;
    handleUploadStatusChange: (uploading: boolean) => void;
}

interface FileUploadDialogToggleButtonProps extends Omit<React.ComponentProps<typeof ToggleButton>, "onClick"> {
    dialogTitle: string;
    dialogDescription: React.ReactNode;
    onFilesUploaded: (files: Array<{ url: string; type: string; details?: EnhancedFileDetails }>) => void;
    fileTypes?: string[];
    bucket: string;
    path: string;
    cancelLabel?: string;
    successButtonLabel?: string;
    fileManager: FileUploadDialogFileManager;
    allowMultiple?: boolean;
}

const FileUploadDialogToggleButton: React.FC<FileUploadDialogToggleButtonProps> = ({
    dialogTitle,
    dialogDescription,
    onFilesUploaded,
    fileTypes = [],
    bucket,
    path,
    cancelLabel = "Cancel",
    successButtonLabel = "Continue",
    fileManager,
    allowMultiple = true,
    ...toggleButtonProps
}) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; type: string; details?: EnhancedFileDetails }>>([]);
    const [isUploading, setIsUploading] = useState(false);

    const handleButtonClick = () => {
        setIsDialogOpen(true);
        setUploadedFiles([]);
    };

    const handleDialogClose = (open: boolean) => {
        if (!open) {
            setIsDialogOpen(false);
            setUploadedFiles([]);
        }
    };

    const handleUploadComplete = async (results: Array<{ url: string; type: string; details?: EnhancedFileDetails }>) => {
        setUploadedFiles((prev) => [...prev, ...results]);
        await fileManager.addFiles(results);
    };

    const handleUploadStatusChange = (uploading: boolean) => {
        setIsUploading(uploading);
        fileManager.handleUploadStatusChange(uploading);
    };

    const handleConfirm = () => {
        if (uploadedFiles.length > 0) {
            onFilesUploaded(uploadedFiles);
            setIsDialogOpen(false);
        }
    };

    return (
        <>
            <ToggleButton {...toggleButtonProps} onClick={handleButtonClick} />

            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{dialogTitle}</DialogTitle>
                        {typeof dialogDescription === "string" ? (
                            <DialogDescription>{dialogDescription}</DialogDescription>
                        ) : (
                            dialogDescription
                        )}
                    </DialogHeader>

                    <div className="py-4">
                        <FileUploadWithStorage
                            bucket={bucket}
                            path={path}
                            onUploadComplete={handleUploadComplete}
                            onUploadStatusChange={handleUploadStatusChange}
                            multiple={allowMultiple}
                            useMiniUploader={true}
                        />
                    </div>

                    <DialogFooter className="flex justify-between">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            {cancelLabel}
                        </Button>

                        <Button onClick={handleConfirm} disabled={uploadedFiles.length === 0 || isUploading}>
                            {successButtonLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default FileUploadDialogToggleButton;
