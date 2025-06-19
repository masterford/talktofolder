"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import FolderCard from "./folder-card"
import RecentChatsCarousel from "./recent-chats-carousel"
import { useRouter } from "next/navigation"

interface Folder {
  id: string
  name: string
  driveId: string
  fileCount: number
  lastIndexed: string
  indexStatus: string
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedFolderUrl, setSelectedFolderUrl] = useState("")
  const [folderUrlError, setFolderUrlError] = useState("")
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isDriveConnected, setIsDriveConnected] = useState(false)
  const [isCheckingDriveStatus, setIsCheckingDriveStatus] = useState(true)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [recentChatsRefreshTrigger, setRecentChatsRefreshTrigger] = useState(0)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  const fetchGoogleDriveFolders = useCallback(async (pageToken?: string) => {
    if (!pageToken) {
      setIsLoading(true)
    } else {
      setIsLoadingMore(true)
    }

    try {
      const url = new URL("/api/google-drive/folders", window.location.origin)
      if (pageToken) {
        url.searchParams.append("pageToken", pageToken)
      }
      
      const response = await fetch(url.toString())
      
      if (!response.ok) {
        if (response.status === 401) {
          // Authentication expired, redirect to sign in
          window.location.href = "/auth/signin"
          return
        }
        console.error("Failed to fetch folders")
        return
      }

      const data = await response.json()
      
      if (pageToken) {
        setFolders(prev => [...prev, ...(data.folders || [])])
      } else {
        setFolders(data.folders || [])
      }
      
      setNextPageToken(data.nextPageToken || null)
      setHasMore(!!data.nextPageToken)
    } catch (error) {
      console.error("Error fetching folders:", error)
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [])

  const checkDriveStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/google-drive/status")
      if (response.ok) {
        const data = await response.json()
        setIsDriveConnected(data.connected)
        if (data.connected) {
          fetchGoogleDriveFolders()
        }
      }
    } catch (error) {
      console.error("Error checking Drive status:", error)
    } finally {
      setIsCheckingDriveStatus(false)
    }
  }, [fetchGoogleDriveFolders])

  useEffect(() => {
    checkDriveStatus()
  }, [checkDriveStatus])

  // Check URL params for drive connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('drive_connected') === 'true') {
      setIsDriveConnected(true)
      fetchGoogleDriveFolders()
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchGoogleDriveFolders])

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

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore) return

    const callback = (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && nextPageToken) {
        fetchGoogleDriveFolders(nextPageToken)
      }
    }

    observerRef.current = new IntersectionObserver(callback, {
      root: scrollContainerRef.current,
      rootMargin: '50px',
    })

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current)
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [isLoading, isLoadingMore, hasMore, nextPageToken, fetchGoogleDriveFolders])

  const handleConnectDrive = async () => {
    try {
      const response = await fetch("/api/auth/google-drive/connect")
      if (response.ok) {
        const data = await response.json()
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error("Error connecting to Drive:", error)
      alert("Failed to connect to Google Drive")
    }
  }

  const handleAddSpecificFolder = async () => {
    if (!selectedFolderUrl) return

    try {
      const response = await fetch("/api/google-drive/folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ folderUrl: selectedFolderUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        setFolderUrlError(data.error || "Failed to add folder")
        return
      }

      // Add the new folder to the list
      setFolders((prev) => [...prev, data.folder])
      setSelectedFolderUrl("")
      setFolderUrlError("")

      // Create or get chat for this folder
      const chatResponse = await fetch(`/api/folders/${data.folder.driveId}/chat`, {
        method: "POST",
      })

      if (!chatResponse.ok) {
        console.error("Failed to create chat for folder")
      } else {
        // Trigger refresh of recent chats
        setRecentChatsRefreshTrigger(prev => prev + 1)
      }

      // Fetch files for the folder to save them in the database
      const filesResponse = await fetch(`/api/google-drive/folders/${data.folder.driveId}/files`)
      
      if (filesResponse.ok) {
        await filesResponse.json() // This ensures files are saved to the database
        
        // Trigger indexing for the folder in the background (don't wait for it)
        fetch(`/api/folders/${data.folder.driveId}/index-assistant`, {
          method: "POST",
        }).then(response => {
          if (!response.ok) {
            console.error("Failed to start indexing in background")
          }
        }).catch(error => {
          console.error("Error starting background indexing:", error)
        })
      }

      fetchGoogleDriveFolders()
    } catch (error) {
      console.error("Error adding folder:", error)
      setFolderUrlError("Failed to add folder")
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-3xl font-bold text-indigo-600">📁</span>
              </div>
              <h1 className="ml-3 text-2xl font-bold text-gray-900">TalkToFolder</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button className="text-gray-600 hover:text-gray-900">Share</button>
              <button className="text-gray-600 hover:text-gray-900">Settings</button>
              <div className="relative" ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {session?.user?.image ? (
                    <img
                      className="h-8 w-8 rounded-full"
                      src={session.user.image}
                      alt={session?.user?.name || "User"}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.nextElementSibling?.setAttribute('style', 'display: flex')
                      }}
                    />
                  ) : null}
                  <div 
                    className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-medium"
                    style={{ display: session?.user?.image ? 'none' : 'flex' }}
                  >
                    {session?.user?.name?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Specific Folder Section - Only show if Drive is connected */}
        {isDriveConnected && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Add a Specific Folder</h2>
            <div className="flex items-center space-x-4">
              <input
                type="text"
                value={selectedFolderUrl}
                onChange={(e) => {
                  setSelectedFolderUrl(e.target.value)
                  setFolderUrlError("")
                }}
                placeholder="Paste Google Drive folder link"
                className={`flex-1 border rounded-md px-3 py-2 text-gray-900 ${
                  folderUrlError ? "border-red-500" : "border-gray-300"
                }`}
              />
              <button
                onClick={handleAddSpecificFolder}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Add Folder
              </button>
            </div>
            {folderUrlError && (
              <p className="text-sm text-red-600 mt-2">{folderUrlError}</p>
            )}
            <p className="text-sm text-gray-500 mt-2">
              Or choose from your Google Drive folders below
            </p>
          </div>
        )}

        {/* Recent Chats Section - Only show if Drive is connected */}
        {isDriveConnected && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Recent Chats</h3>
            <div className="bg-white rounded-lg shadow p-6">
              <RecentChatsCarousel refreshTrigger={recentChatsRefreshTrigger} />
            </div>
          </div>
        )}

        {/* Folders Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-gray-900">Your Google Drive Folders</h3>
          <div className="bg-white rounded-lg shadow p-6">
            {isCheckingDriveStatus ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-gray-500 mt-2">Checking Google Drive connection...</p>
              </div>
            ) : !isDriveConnected ? (
              <div className="text-center py-12">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No Google Drive access</h3>
                <p className="mt-1 text-sm text-gray-500">Connect your Google Drive to view and chat with your folders.</p>
                <div className="mt-6">
                  <button
                    onClick={handleConnectDrive}
                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Connect Google Drive
                  </button>
                </div>
              </div>
            ) : isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="text-gray-500 mt-2">Loading your folders...</p>
              </div>
            ) : folders.length === 0 && !hasMore ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No folders found in your Google Drive</p>
              </div>
            ) : (
              <div ref={scrollContainerRef} className="max-h-126 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pr-2">
                  {folders.map((folder) => (
                    <FolderCard key={folder.driveId} folder={folder} />
                  ))}
                </div>
                
                {/* Load More Trigger */}
                {hasMore && (
                  <div 
                    ref={loadMoreRef}
                    className="text-center py-8"
                  >
                    {isLoadingMore ? (
                      <>
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                        <p className="text-gray-500 mt-2 text-sm">Loading more folders...</p>
                      </>
                    ) : (
                      <p className="text-gray-400 text-sm">Scroll to load more</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}