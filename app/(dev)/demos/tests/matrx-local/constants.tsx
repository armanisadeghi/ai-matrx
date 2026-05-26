import {ApiConfig} from "@/app/(dev)/demos/tests/matrx-local/types";

export const API_CONFIG: ApiConfig = {
    baseUrl: 'http://127.0.0.1:8000',
    categories: [
        {
            id: 'system',
            name: 'System',
            endpoints: [
                {
                    id: 'root',
                    name: 'Health Check',
                    method: 'GET',
                    url: '/',
                    description: 'Check if API is working',
                    responseType: 'json'
                },
                {
                    id: 'systemInfo',
                    name: 'System Info',
                    method: 'GET',
                    url: '/system/info',
                    description: 'Get system information',
                    responseType: 'json'
                },
                {
                    id: 'logs',
                    name: 'System Logs',
                    method: 'GET',
                    url: '/logs',
                    description: 'Retrieve latest system logs',
                    responseType: 'json'
                }
            ]
        },
        {
            id: 'filesystem',
            name: 'File System',
            endpoints: [
                {
                    id: 'files',
                    name: 'List Files',
                    method: 'GET',
                    url: '/files',
                    description: 'List files in directory',
                    responseType: 'json',
                    queryParams: {
                        directory: {
                            type: 'string',
                            default: '.'
                        }
                    }
                },
                {
                    id: 'screenshot',
                    name: 'Capture Screenshot',
                    method: 'POST',
                    url: '/screenshot',
                    description: 'Take a screenshot',
                    responseType: 'file',
                    fileType: 'image/png',
                    returnsFile: true
                },
                {
                    id: 'generateStructure',
                    name: 'Generate Directory Structure',
                    method: 'POST',  // Make sure this is POST
                    url: '/generate-directory-structure',  // Make sure this is the exact path
                    description: 'Generate directory structure',
                    responseType: 'file',
                    fileType: 'text/plain',
                    returnsFile: true,
                    hasBody: false  // Change this to false since we're using query params
                },
                {
                    id: 'generateStructureText',
                    name: 'Generate Directory Structure (Text)',
                    method: 'POST',
                    url: '/generate-directory-structure/text',
                    description: 'Generate directory structure',
                    responseType: 'file',
                    fileType: 'text/plain',
                    returnsFile: true,
                    hasBody: false  // Change this to false since we're using query params
                },
                {
                    id: 'generateStructureJson',
                    name: 'Generate Directory Structure (JSON)',
                    method: 'POST',
                    url: '/generate-directory-structure/json',
                    description: 'Generate directory structure as JSON',
                    responseType: 'json',  // This one isn't a file download
                    hasBody: false
                },
                {
                    id: 'generateStructureZip',
                    name: 'Generate Directory Structure (All Files)',
                    method: 'POST',
                    url: '/generate-directory-structure/zip',
                    description: 'Generate directory structure with all files (ZIP)',
                    responseType: 'file',
                    fileType: 'application/zip',
                    returnsFile: true,
                    hasBody: false  // Change this to false since we're using query params
                }
            ]
        },
        {
            id: 'data',
            name: 'Data',
            endpoints: [
                {
                    id: 'dbData',
                    name: 'Database Data',
                    method: 'GET',
                    url: '/db-data',
                    description: 'Fetch data from database',
                    responseType: 'json'
                },
                {
                    id: 'trigger',
                    name: 'Trigger Event',
                    method: 'POST',
                    url: '/trigger',
                    description: 'Trigger a browser event',
                    responseType: 'json',
                    hasBody: true,
                    defaultBody: {
                        event: 'test',
                        data: {}
                    }
                }
            ]
        }
    ],
    websocket: {
        url: 'ws://127.0.0.1:8000/ws',
        defaultMessage: 'Hello, WebSocket!',
        reconnectInterval: 5000,
        autoReconnect: true,
        maxRetries: 5
    },
    defaultHeaders: {
        'Accept': 'application/json'
    }
}