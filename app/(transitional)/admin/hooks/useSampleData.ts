import { useState, useEffect } from "react";

interface UseSampleDataResponse {
    loading: boolean;
    error: Error | null;
    data: any | null;
}

type SampleDataType = "userManagement" | "fileSystemManagement" | "logsManagement" | "debugConsole" | "linkManagement";

const useSampleData = (type: SampleDataType): UseSampleDataResponse => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [data, setData] = useState<any | null>(null);

    useEffect(() => {
        const fetchData = () => {
            setLoading(true);
            setTimeout(() => {
                try {
                    let fakeData;
                    switch (type) {
                        case "userManagement":
                            fakeData = [
                                { id: 1, name: "Alice", role: "Admin" },
                                { id: 2, name: "Bob", role: "User" },
                            ];
                            break;
                        case "fileSystemManagement":
                            fakeData = [
                                { fileName: "report.pdf", size: "2 MB", modified: "2023-10-01" },
                                { fileName: "data.csv", size: "1 MB", modified: "2023-09-28" },
                            ];
                            break;
                        case "logsManagement":
                            fakeData = [
                                { timestamp: "2023-10-12 10:00", level: "INFO", message: "User logged in" },
                                { timestamp: "2023-10-12 10:05", level: "ERROR", message: "File not found" },
                            ];
                            break;
                        case "debugConsole":
                            fakeData = [
                                { id: 1, command: "GET /api/users", status: "200 OK", duration: "120ms" },
                                { id: 2, command: "POST /api/files", status: "500 Internal Server Error", duration: "230ms" },
                            ];
                            break;
                        case "linkManagement":
                            fakeData = [
                                { id: 1, label: "Home", url: "/home" },
                                { id: 2, label: "Settings", url: "/settings" },
                            ];
                            break;
                        default:
                            fakeData = { message: "Invalid data type" };
                    }
                    setData(fakeData);
                    setLoading(false);
                } catch (err) {
                    setError(new Error("Failed to fetch data"));
                    setLoading(false);
                }
            }, 1000);
        };

        fetchData();
    }, [type]);

    return { loading, error, data };
};

export default useSampleData;
