import ImageStudioShellClient from "./ImageStudioShellClient";

/**
 * /image-studio/convert
 *
 * The interactive tool. The interactive body (`ImageStudioShell`) is
 * dynamically imported on the client with ssr:false so there's no
 * server/client mismatch around FileReader / URL.createObjectURL /
 * react-dropzone.
 *
 * Header + outer chrome are owned by `(tools)/layout.tsx`.
 */
export default function ConvertPage() {
  return <ImageStudioShellClient defaultFolder="image-studio" />;
}
