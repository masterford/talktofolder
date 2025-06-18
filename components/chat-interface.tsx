"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import ReactMarkdown from "react-markdown"
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
  indexStatus?: string
}

interface Message {
  id: string
  role: string
  content: string
  citations?: {
    fileName: string
    fileId: string
    score: number
    chunkIndex: number
  }[]
  createdAt: string
}

interface ChatSession {
  id: string
  folderId: string
  folderName: string
}

export default function ChatInterface({ folderId }: ChatInterfaceProps) {
  const router = useRouter()
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatSession, setChatSession] = useState<ChatSession | null>(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [files, setFiles] = useState<FileInfo[]>([])
  const [subfolders, setSubfolders] = useState<SubfolderInfo[]>([])
  const [folder, setFolder] = useState<FolderInfo | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const [isLoadingFiles, setIsLoadingFiles] = useState(true)
  const [isIndexing, setIsIndexing] = useState(false)
  const [indexingStatus, setIndexingStatus] = useState<string>('pending')
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
        setIndexingStatus(filesData.folder?.indexStatus || 'pending')
        
        // Create/access chat session to track folder access
        const chatResponse = await fetch(`/api/folders/${folderId}/chat`, {
          method: 'POST',
        })
        
        if (chatResponse.ok) {
          const chatData = await chatResponse.json()
          setChatSession({
            id: chatData.chatId,
            folderId: chatData.folderId,
            folderName: chatData.folderName,
          })
          
          // Load existing messages for this chat
          const messagesResponse = await fetch(`/api/chat/${chatData.chatId}/messages`)
          if (messagesResponse.ok) {
            const messagesData = await messagesResponse.json()
            setMessages(messagesData.messages || [])
          }
        }
        
        // Fetch breadcrumbs
        const breadcrumbResponse = await fetch(`/api/google-drive/folders/${folderId}/breadcrumb`)
        if (breadcrumbResponse.ok) {
          const breadcrumbData = await breadcrumbResponse.json()
          setBreadcrumbs(breadcrumbData.breadcrumbs || [])
        }

        // Auto-index folder only if it's never been indexed (pending status)
        if (filesData.folder?.indexStatus === 'pending' && filesData.files?.length > 0) {
          handleFolderIndex()
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

  const handleFolderIndex = async () => {
    if (isIndexing) return
    
    try {
      setIsIndexing(true)
      setIndexingStatus('processing')
      
      const response = await fetch(`/api/folders/${folderId}/index-assistant`, {
        method: 'POST',
      })
      
      if (response.ok) {
        const result = await response.json()
        setIndexingStatus(result.successCount > 0 && result.errorCount === 0 ? 'completed' : 
                         result.successCount > 0 ? 'partial' : 'failed')
        
        // Refresh the files list to show updated indexing status
        const filesResponse = await fetch(`/api/google-drive/folders/${folderId}/files`)
        if (filesResponse.ok) {
          const data = await filesResponse.json()
          setFiles(data.files || [])
          setFolder(data.folder) // Update folder object with new indexStatus
        }
      } else {
        setIndexingStatus('failed')
      }
    } catch (error) {
      console.error('Error indexing folder:', error)
      setIndexingStatus('failed')
    } finally {
      setIsIndexing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading || !chatSession) return

    const userMessage = input
    setInput("")
    
    // Add user message immediately to UI
    const tempUserMessage: Message = {
      id: `temp-user-${Date.now()}`,
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUserMessage])
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          folderId: folderId,
          chatId: chatSession.id,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      const data = await response.json()
      
      // Reload messages from the server to get the updated conversation
      const messagesResponse = await fetch(`/api/chat/${chatSession.id}/messages`)
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json()
        setMessages(messagesData.messages || [])
      }
      
    } catch (error) {
      console.error('Error sending message:', error)
      // Show error message to user
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Sorry, there was an error processing your message. Please try again.",
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
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
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">
            {folder ? `${folder.name} Files` : 'Sources'}
          </h2>
          
          {/* Folder indexing status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`px-2 py-1 rounded-full text-xs ${
                indexingStatus === 'completed' ? 'bg-green-100 text-green-800' :
                indexingStatus === 'processing' ? 'bg-blue-100 text-blue-800' :
                indexingStatus === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                indexingStatus === 'failed' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {indexingStatus === 'completed' ? 'Fully indexed' :
                 indexingStatus === 'processing' ? 'Indexing...' :
                 indexingStatus === 'partial' ? 'Partially indexed' :
                 indexingStatus === 'failed' ? 'Indexing failed' :
                 'Not indexed'}
              </span>
              
              {isIndexing && (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              )}
            </div>
            
            {!isIndexing && files.length > 0 && (
              <button
                onClick={handleFolderIndex}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {indexingStatus === 'completed' ? 'Re-index' : 'Index'}
              </button>
            )}
          </div>
        </div>
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
                <FileListItem key={file.id} file={file} />
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
              {indexingStatus !== 'completed' && (
                <p className="text-sm mt-2">Make sure your files are indexed to get the best responses!</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="max-w-2xl">
                    <div
                      className={`px-4 py-2 rounded-lg ${
                        message.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 text-gray-900"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none prose-gray">
                          <ReactMarkdown 
                            components={{
                              // Customize markdown rendering for better styling
                              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="mb-2 pl-4 list-disc">{children}</ul>,
                              ol: ({ children }) => <ol className="mb-2 pl-4 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="mb-1">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              code: ({ children }) => <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
                              pre: ({ children }) => <pre className="bg-gray-100 p-2 rounded text-sm font-mono overflow-x-auto">{children}</pre>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        message.content
                      )}
                    </div>
                    
                    {/* Citations for AI responses */}
                    {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        <p className="font-medium">Sources:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {message.citations.map((citation, idx) => (
                            <span 
                              key={idx}
                              className="bg-gray-100 px-2 py-1 rounded text-gray-700"
                              title={`Relevance: ${(citation.score * 100).toFixed(1)}%`}
                            >
                              📄 {citation.fileName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="max-w-2xl">
                    <div className="bg-gray-200 text-gray-900 px-4 py-2 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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