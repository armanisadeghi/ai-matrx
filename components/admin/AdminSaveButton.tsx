"use client";

import { saveJson } from "@/actions/json.actions";
import { savePublicText, savePublicImage } from "@/actions/file.actions";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";

interface SaveButtonProps {
  content: any;
  filename: string;
  path?: string[];
}

interface SaveButtonState {
  status: string | null;
  fileLink: string | null;
}

// Common save button layout
const SaveButtonLayout: React.FC<{
  onClick: () => Promise<void>;
  buttonText: string;
  state: SaveButtonState;
}> = ({ onClick, buttonText, state: { status, fileLink } }) => (
  <div>
    <Button onClick={onClick} className="btn btn-primary">
      {buttonText}
    </Button>
    {status && <p>{status}</p>}
    {fileLink && (
      <p>
        File saved at: <span dangerouslySetInnerHTML={{ __html: fileLink }} />
      </p>
    )}
  </div>
);

export const AdminSaveJsonButton = ({
  content,
  filename,
  path = ["json-exports"],
}: SaveButtonProps) => {
  const [state, setState] = useState<SaveButtonState>({
    status: null,
    fileLink: null,
  });

  const saveJsonData = async () => {
    setState({ status: "Saving...", fileLink: null });

    try {
      const result = await saveJson({
        filename,
        jsonData: content,
        directoryType: "app",
        path: ["(dev)", "demos", "tests", ...path],
      });

      if (result.success) {
        setState({
          status: "File saved successfully",
          fileLink: result.clickableLink ?? result.filePath ?? null,
        });
      } else {
        setState({
          status: `Failed to save file: ${result.error}`,
          fileLink: null,
        });
      }
    } catch (error) {
      setState({
        status: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        fileLink: null,
      });
    }
  };

  return (
    <SaveButtonLayout
      onClick={saveJsonData}
      buttonText="Save JSON"
      state={state}
    />
  );
};

export const AdminSaveTextButton = ({
  content,
  filename,
  path = ["text-files"],
}: SaveButtonProps) => {
  const [state, setState] = useState<SaveButtonState>({
    status: null,
    fileLink: null,
  });

  const saveTextData = async () => {
    setState({ status: "Saving...", fileLink: null });

    try {
      const result = await savePublicText({
        filename,
        content: String(content),
        path,
      });

      if (result.success) {
        setState({
          status: "File saved successfully",
          fileLink: result.clickableLink ?? result.filePath ?? null,
        });
      } else {
        setState({
          status: `Failed to save file: ${result.error}`,
          fileLink: null,
        });
      }
    } catch (error) {
      setState({
        status: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        fileLink: null,
      });
    }
  };

  return (
    <SaveButtonLayout
      onClick={saveTextData}
      buttonText="Save Text"
      state={state}
    />
  );
};

export const AdminSaveImageButton = ({
  content,
  filename,
  path = ["images"],
}: SaveButtonProps) => {
  const [state, setState] = useState<SaveButtonState>({
    status: null,
    fileLink: null,
  });

  const saveImageData = async () => {
    setState({ status: "Saving...", fileLink: null });

    try {
      const buffer = content instanceof Buffer ? content : Buffer.from(content);

      const result = await savePublicImage({
        filename,
        content: buffer,
        path,
      });

      if (result.success) {
        setState({
          status: "File saved successfully",
          fileLink: result.clickableLink ?? result.filePath ?? null,
        });
      } else {
        setState({
          status: `Failed to save file: ${result.error}`,
          fileLink: null,
        });
      }
    } catch (error) {
      setState({
        status: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        fileLink: null,
      });
    }
  };

  return (
    <SaveButtonLayout
      onClick={saveImageData}
      buttonText="Save Image"
      state={state}
    />
  );
};
