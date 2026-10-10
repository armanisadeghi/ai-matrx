import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// BookmarkManager.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@ai-matrx/design-system';
import { saveBookmarks, loadBookmarks, exportBookmarks, importBookmarks } from '../utils/json-path-navigation-util';
import { copyToClipboard } from '../utils/scraper-utils';
const BookmarkManager = ({ open, onOpenChange }) => {
    // State for bookmarks and form inputs
    const [bookmarks, setBookmarks] = useState([]);
    const [addName, setAddName] = useState('');
    const [addJsonPath, setAddJsonPath] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importJson, setImportJson] = useState('');
    // Load bookmarks when the modal opens
    useEffect(() => {
        if (!open)
            return undefined;
        const timer = window.setTimeout(() => setBookmarks(loadBookmarks()), 0);
        return () => window.clearTimeout(timer);
    }, [open]);
    // Functions to manage bookmarks
    const addBookmark = (newBookmark) => {
        const updatedBookmarks = [...bookmarks, newBookmark];
        setBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
    };
    const editBookmark = (index, updatedBookmark) => {
        const updatedBookmarks = bookmarks.map((bm, i) => (i === index ? updatedBookmark : bm));
        setBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
    };
    const deleteBookmark = (index) => {
        const updatedBookmarks = bookmarks.filter((_, i) => i !== index);
        setBookmarks(updatedBookmarks);
        saveBookmarks(updatedBookmarks);
    };
    // Handle adding a new bookmark
    const handleAdd = () => {
        if (addName && addJsonPath) {
            const newBookmark = { name: addName, jsonPath: addJsonPath };
            addBookmark(newBookmark);
            setAddName('');
            setAddJsonPath('');
        }
    };
    // Handle editing
    const startEditing = (index) => {
        setEditingIndex(index);
    };
    const cancelEditing = () => {
        setEditingIndex(null);
    };
    const saveEditing = (index, updatedBookmark) => {
        editBookmark(index, updatedBookmark);
        setEditingIndex(null);
    };
    // Handle export and import
    const handleExport = () => {
        const jsonString = exportBookmarks(bookmarks);
        copyToClipboard(jsonString);
        // Optionally, add a toast notification here to confirm copy
    };
    const handleImport = () => {
        const importedBookmarks = importBookmarks(importJson);
        setBookmarks(importedBookmarks);
        saveBookmarks(importedBookmarks);
        setIsImportOpen(false);
        setImportJson('');
    };
    return (_jsxs(_Fragment, { children: [_jsx(Dialog, { open: open, onOpenChange: onOpenChange, children: _jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Manage Bookmarks" }) }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex space-x-2", children: [_jsx(Input, { placeholder: "Name", value: addName, onChange: (e) => setAddName(e.target.value) }), _jsx(Input, { placeholder: "JSON Path", value: addJsonPath, onChange: (e) => setAddJsonPath(e.target.value) }), _jsx(Button, { onClick: handleAdd, children: "Add" })] }), _jsxs("div", { className: "max-h-[50dvh] overflow-y-auto", children: [bookmarks.map((bookmark, index) => (editingIndex === index ? (_jsxs("div", { className: "flex space-x-2 p-2 border-b", children: [_jsx(Input, { value: bookmark.name, onChange: (e) => editBookmark(index, { ...bookmark, name: e.target.value }) }), _jsx(Input, { value: bookmark.jsonPath, onChange: (e) => editBookmark(index, { ...bookmark, jsonPath: e.target.value }) }), _jsx(Button, { onClick: () => saveEditing(index, bookmark), children: "Save" }), _jsx(Button, { variant: "ghost", onClick: cancelEditing, children: "Cancel" })] }, index)) : (_jsxs("div", { className: "flex justify-between items-center p-2 border-b", children: [_jsxs("div", { children: [_jsx("div", { className: "font-medium", children: bookmark.name }), _jsx("div", { className: "text-sm text-gray-500", children: bookmark.jsonPath })] }), _jsxs("div", { className: "flex space-x-1", children: [_jsx(Button, { variant: "ghost", onClick: () => startEditing(index), children: "Edit" }), _jsx(Button, { variant: "ghost", onClick: () => deleteBookmark(index), children: "Delete" })] })] }, index)))), bookmarks.length === 0 && (_jsx("div", { className: "text-center text-gray-500 py-2", children: "No bookmarks yet" }))] }), _jsxs("div", { className: "flex space-x-2", children: [_jsx(Button, { onClick: handleExport, children: "Export to Clipboard" }), _jsx(Button, { onClick: () => setIsImportOpen(true), children: "Import" })] })] })] }) }), _jsx(Dialog, { open: isImportOpen, onOpenChange: setIsImportOpen, children: _jsxs(DialogContent, { className: "sm:max-w-[425px]", children: [_jsx(DialogHeader, { children: _jsx(DialogTitle, { children: "Import Bookmarks" }) }), _jsxs("div", { className: "space-y-4", children: [_jsx("textarea", { className: "w-full h-32 p-2 border rounded resize-none", value: importJson, onChange: (e) => setImportJson(e.target.value), placeholder: `Paste JSON here (e.g., [{"name": "User Email", "jsonPath": "user.email"}])` }), _jsx(Button, { onClick: handleImport, children: "Import" })] })] }) })] }));
};
export default BookmarkManager;
