import { GlobalContextMenu } from "../GlobalContextMenu";


export const FileManagerItem = ({ path, bucketName }: { path: string; bucketName: string }) => {
    return (
        <GlobalContextMenu
            module="fileManager"
            show={['download', 'delete']} // Show optional items
            hide={['settings']} // Hide default items
            data={{ path, bucketName }}
        >
            <div>Your content here</div>
        </GlobalContextMenu>
    );
};
