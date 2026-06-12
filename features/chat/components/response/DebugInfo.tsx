import React from "react";
import type { RootState } from "@/lib/redux/store";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectListenerIdsByTaskId } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import type { SocketErrorObject } from "@/lib/redux/socket-io/socket.types";
import {
  selectResponseTextByListenerId,
  selectResponseEndedByListenerId,
  selectResponseDataByListenerId,
  selectResponseInfoByListenerId,
  selectResponseErrorsByListenerId,
} from "@/lib/redux/socket-io/selectors/socket-response-selectors";
import { selectTaskFirstListenerId } from "@/lib/redux/socket-io/selectors/socket-task-selectors";

export const DebugInfo: React.FC<{
  activeMessageStatus: string;
  shouldShowLoader: boolean;
  isStreaming: boolean | string;
  isStreamEnded: boolean | string;
  isStreamError: boolean | string;
  streamError: SocketErrorObject[] | null;
  streamKey: string;
  taskId: string;
  settings: any;
}> = ({
  activeMessageStatus,
  shouldShowLoader,
  isStreaming,
  isStreamEnded,
  isStreamError,
  streamError,
  streamKey,
  taskId,
  settings,
}) => {
  const allListenerIds = useAppSelector((state: RootState) =>
    selectListenerIdsByTaskId(state, taskId),
  );
  const firstListenerId = useAppSelector((state) =>
    selectTaskFirstListenerId(state, taskId),
  );
  const infoResponse = useAppSelector(
    selectResponseInfoByListenerId(firstListenerId),
  );

  return (
    <div className="fixed left-6 top-1/2 transform -translate-y-1/2 w-96 text-left p-2 my-2 bg-gray-100 dark:bg-gray-800 rounded-xl border-3 border-gray-300 dark:border-gray-600 shadow-md z-50 overflow-auto max-h-[80dvh]">
      <div className="font-mono space-y-4 text-lg text-gray-700 dark:text-gray-300">
        <div>Status: {activeMessageStatus}</div>
        <div>
          Is Streaming:{" "}
          <span className={isStreaming ? "text-green-500" : "text-red-500"}>
            {isStreaming ? "true" : "false"}
          </span>
        </div>
        <div>
          Should Show Loader:{" "}
          <span
            className={shouldShowLoader ? "text-green-500" : "text-red-500"}
          >
            {shouldShowLoader ? "true" : "false"}
          </span>
        </div>
        <div>Is Stream Ended: {isStreamEnded ? "true" : "false"}</div>
        <div>Is Stream Error: {isStreamError ? "true" : "false"}</div>
        <div>Stream Error:</div>
        {streamError ? (
          <div className="pl-2">
            <pre className="text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(streamError, null, 2)}
            </pre>
          </div>
        ) : (
          <div> - None</div>
        )}
        <div>Stream Key: {streamKey}</div>
        <div>Task Id:</div>
        <div> - {taskId}</div>
        <div>Settings:</div>
        {settings ? (
          <div className="pl-2">
            <pre className="text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(settings, null, 2)}
            </pre>
          </div>
        ) : (
          <div> - None</div>
        )}
        <div>All Listener Ids:</div>
        {allListenerIds && allListenerIds.length > 0 ? (
          allListenerIds.map((id, index) => <div key={index}> - {id}</div>)
        ) : (
          <div> - None</div>
        )}
        <div>Info Response:</div>
        {infoResponse && infoResponse.length > 0 ? (
          <div className="pl-2">
            <pre className="text-xs whitespace-pre-wrap break-words">
              {JSON.stringify(infoResponse, null, 2)}
            </pre>
          </div>
        ) : (
          <div> - None</div>
        )}
      </div>
    </div>
  );
};

export default DebugInfo;
