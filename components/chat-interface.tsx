"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import FileListItem from "./file-list-item"
import FolderListItem from "./folder-list-item"
import BreadcrumbNavigation from "./breadcrumb-navigation"

interface ChatInterfaceProps {
  folderId: string
}

interface FileInfo {
  id: string
  driveId?: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  webViewLink?: string
  iconLink?: string
  indexed?: boolean
}

interface SubfolderInfo {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
}

interface BreadcrumbItem {
  id: string
  name: string
  isRoot: boolean
}

interface FolderInfo {
  id: string
  name: string
  driveId: string
}

export default function ChatInterface({ folderId }: ChatInterfaceProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [subfolders, setSubfolders] = useState<SubfolderInfo[]>([])
  const [folder, setFolder] = useState<FolderInfo | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  // Fetch files and breadcrumbs when component mounts
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoadingFiles(true)
        
        // Fetch files and folders
        const filesResponse = await fetch(`/api/google-drive/folders/${folderId}/files`)
        if (!filesResponse.ok) {
          if (filesResponse.status === 401) {
            router.push('/auth/signin')
            return
          }
          return
        }
        const filesData = await filesResponse.json()
        setFiles(filesData.files || [])
        setSubfolders(filesData.subfolders || [])
        setFolder(filesData.folder)
        
        // Fetch breadcrumbs
        const breadcrumbResponse = await fetch(`/api/google-drive/folders/${folderId}/breadcrumb`)
        if (breadcrumbResponse.ok) {
          const breadcrumbData = await breadcrumbResponse.json()
          setBreadcrumbs(breadcrumbData.breadcrumbs || [])
        }
      } catch (error) {
      } finally {
        setIsLoadingFiles(false)
      }
    }

    fetchData()
  }, [folderId, router])

  // Handle click outside of profile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = () => {
    // Redirect to sign out page which will handle cleanup
    router.push('/auth/signout')
  }

  const handleFolderClick = (subfolderId: string) => {
    router.push(`/chat/${subfolderId}`)
  }

  const handleFileIndex = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}/index`, {
        method: 'POST',
      })
      
      if (response.ok) {
        // Refresh the files list to show updated indexing status
        const filesResponse = await fetch(`/api/google-drive/folders/${folderId}/files`)
        if (filesResponse.ok) {
          const data = await filesResponse.json()
          setFiles(data.files || [])
        }
      } else {
        console.error('Failed to index file')
      }
    } catch (error) {
      console.error('Error indexing file:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      // TODO: Implement chat API call
      const response = { role: "assistant", content: "This is a placeholder response. The chat functionality will be implemented in later phases." }
      setMessages((prev) => [...prev, response])
    } catch (error) {
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        <div className="mb-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-600 hover:text-gray-900 flex items-center mb-2"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Folders
          </button>
          <BreadcrumbNavigation breadcrumbs={breadcrumbs} />
        </div>
        <h2 className="text-lg font-semibold mb-4">
          {folder ? `${folder.name} Files` : 'Sources'}
        </h2>
        <div className="space-y-2">
          {isLoadingFiles ? (
            <div className="flex items-center justify-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            </div>
          ) : files.length === 0 && subfolders.length === 0 ? (
            <div className="text-sm text-gray-500">
              <p>No supported files found in this folder</p>
              <p className="text-xs mt-1">Supported: Documents, PDFs, CSV/Sheets</p>
            </div>
          ) : (
            <div className="space-y-1">
              {subfolders.map((subfolder) => (
                <FolderListItem 
                  key={subfolder.id} 
                  folder={subfolder} 
                  onFolderClick={handleFolderClick}
                />
              ))}
              {files.map((file) => (
                <FileListItem key={file.id} file={file} onIndex={handleFileIndex} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">
              {folder ? `Chat with ${folder.name}` : 'Chat'}
            </h1>
            <div className="flex items-center space-x-4">
              <button className="text-gray-600 hover:text-gray-900">Share</button>
              <button className="text-gray-600 hover:text-gray-900">Settings</button>
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <img
                    className="h-8 w-8 rounded-full"
                    src={session?.user?.image || ""}
                    alt={session?.user?.name || "User"}
                  />
                </button>

                {/* Profile Dropdown Menu */}
                {showProfileMenu && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1" role="menu">
                      <div className="px-4 py-2 text-sm text-gray-700 border-b">
                        <div className="font-medium">{session?.user?.name}</div>
                        <div className="text-gray-500 text-xs truncate">{session?.user?.email}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false)
                          router.push('/settings')
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          setShowProfileMenu(false)
                          handleSignOut()
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        role="menuitem"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 mt-8">
              <p>Start a conversation by asking a question about the files in this folder</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-2xl px-4 py-2 rounded-lg ${
                      message.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-gray-900"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-gray-200 px-6 py-4">
          <div className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question or make a request..."
              className="flex-1 border border-gray-300 rounded-md px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}