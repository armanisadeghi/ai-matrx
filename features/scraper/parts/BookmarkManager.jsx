// BookmarkManager.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/ButtonMine';
import { Input } from '@/components/ui/input';
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
    if (open) {
      setBookmarks(loadBookmarks());
    }
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Manage Bookmarks</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add Bookmark Form */}
            <div className="flex space-x-2">
              <Input
                placeholder="Name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
              <Input
                placeholder="JSON Path"
                value={addJsonPath}
                onChange={(e) => setAddJsonPath(e.target.value)}
              />
              <Button onClick={handleAdd}>Add</Button>
            </div>
            {/* Bookmarks List */}
            <div className="max-h-[50vh] overflow-y-auto">
              {bookmarks.map((bookmark, index) => (
                editingIndex === index ? (
                  <div key={index} className="flex space-x-2 p-2 border-b">
                    <Input
                      value={bookmark.name}
                      onChange={(e) => editBookmark(index, { ...bookmark, name: e.target.value })}
                    />
                    <Input
                      value={bookmark.jsonPath}
                      onChange={(e) => editBookmark(index, { ...bookmark, jsonPath: e.target.value })}
                    />
                    <Button onClick={() => saveEditing(index, bookmark)}>Save</Button>
                    <Button variant="ghost" onClick={cancelEditing}>Cancel</Button>
                  </div>
                ) : (
                  <div key={index} className="flex justify-between items-center p-2 border-b">
                    <div>
                      <div className="font-medium">{bookmark.name}</div>
                      <div className="text-sm text-gray-500">{bookmark.jsonPath}</div>
                    </div>
                    <div className="flex space-x-1">
                      <Button variant="ghost" onClick={() => startEditing(index)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => deleteBookmark(index)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )
              ))}
              {bookmarks.length === 0 && (
                <div className="text-center text-gray-500 py-2">No bookmarks yet</div>
              )}
            </div>
            {/* Export and Import Buttons */}
            <div className="flex space-x-2">
              <Button onClick={handleExport}>Export to Clipboard</Button>
              <Button onClick={() => setIsImportOpen(true)}>Import</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Import Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Import Bookmarks</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <textarea
              className="w-full h-32 p-2 border rounded resize-none"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder={`Paste JSON here (e.g., [{"name": "User Email", "jsonPath": "user.email"}])`}
            />
            <Button onClick={handleImport}>Import</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BookmarkManager;