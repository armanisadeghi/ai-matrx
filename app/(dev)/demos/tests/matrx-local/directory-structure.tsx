import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface DirectoryStructureFormProps {
    onSubmit: (params: DirectoryStructureParams) => void;
    loading?: boolean;
}

export interface DirectoryStructureParams {
    root_directory: string;
    project_root: string;
    common_configs?: Record<string, any> | string;
}

export const DirectoryStructureForm = ({ onSubmit, loading }: DirectoryStructureFormProps) => {
    const [rootDir, setRootDir] = useState('');
    const [projectRoot, setProjectRoot] = useState('');
    const [commonConfigs, setCommonConfigs] = useState('');

    const handleSubmit = () => {
        try {
            // Normalize paths by replacing all backslashes with forward slashes
            const normalizedRootDir = rootDir.replace(/\\/g, '/');
            const normalizedProjectRoot = projectRoot.replace(/\\/g, '/');

            const params: DirectoryStructureParams = {
                root_directory: normalizedRootDir,
                project_root: normalizedProjectRoot
            };

            // Handle common configs
            if (commonConfigs.trim()) {
                try {
                    // Try to parse as JSON first
                    params.common_configs = JSON.parse(commonConfigs);
                } catch (e) {
                    // If JSON parsing fails, use as plain text
                    params.common_configs = commonConfigs;
                }
            }

            onSubmit(params);
        } catch (error) {
            console.error('Form Error:', error);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Root Directory</label>
                <Input
                    value={rootDir}
                    onChange={(e) => setRootDir(e.target.value)}
                    placeholder="Enter the root directory path..."
                />
                <p className="text-sm text-muted-foreground">
                    The directory to analyze
                </p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Project Root</label>
                <Input
                    value={projectRoot}
                    onChange={(e) => setProjectRoot(e.target.value)}
                    placeholder="Enter the project root path..."
                />
                <p className="text-sm text-muted-foreground">
                    The root directory of your project
                </p>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Common Configs (Optional)</label>
                <Textarea
                    value={commonConfigs}
                    onChange={(e) => setCommonConfigs(e.target.value)}
                    placeholder="Enter common configurations (JSON or plain text)..."
                    rows={3}
                />
                <p className="text-sm text-muted-foreground">
                    Additional configuration options (JSON format or plain text)
                </p>
            </div>

            <Button
                onClick={handleSubmit}
                disabled={loading || !rootDir || !projectRoot}
            >
                {loading ? 'Generating...' : 'Generate Structure'}
            </Button>
        </div>
    );
};