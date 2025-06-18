"use client"

import { useState } from "react"

interface AddFolderModalProps {
  onClose: () => void
}

export default function AddFolderModal({ onClose }: AddFolderModalProps) {
  const [folderUrl, setFolderUrl] = useState("")
  const [isValidating, setIsValidating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsValidating(true)

    try {
      // TODO: Implement folder validation and addition
      console.log("Adding folder:", folderUrl)
      
      // Close modal after successful addition
      onClose()
    } catch (error) {
      console.error("Error adding folder:", error)
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add Google Drive Folder</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="folderUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Google Drive Folder URL
            </label>
            <input
              type="url"
              id="folderUrl"
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900"
              placeholder="https://drive.google.com/drive/folders/..."
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              Paste the URL of the Google Drive folder you want to chat with
            </p>
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isValidating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isValidating ? "Validating..." : "Add Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}