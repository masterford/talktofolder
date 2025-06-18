"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import FolderCard from "./folder-card"

interface Folder {
  id: string
  name: string
  driveId: string
  fileCount: number
  lastIndexed: string
  indexStatus: string
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [folders, setFolders] = useState<Folder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedFolderUrl, setSelectedFolderUrl] = useState("")
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    fetchGoogleDriveFolders()
  }, [fetchGoogleDriveFolders])

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
        alert(data.error || "Failed to add folder")
        return
      }

      // Add the new folder to the list
      setFolders((prev) => [...prev, data.folder])
      setSelectedFolderUrl("")

      fetchGoogleDriveFolders()
    } catch (error) {
      console.error("Error adding folder:", error)
      alert("Failed to add folder")
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
              <div className="relative">
                <button
                  onClick={() => signOut()}
                  className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <img
                    className="h-8 w-8 rounded-full"
                    src={session?.user?.image || ""}
                    alt={session?.user?.name || "User"}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Add Specific Folder Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Add a Specific Folder</h2>
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={selectedFolderUrl}
              onChange={(e) => setSelectedFolderUrl(e.target.value)}
              placeholder="Paste Google Drive folder link"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2"
            />
            <button
              onClick={handleAddSpecificFolder}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
            >
              Add Folder
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Or choose from your Google Drive folders below
          </p>
        </div>

        {/* Folders Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Your Google Drive Folders</h3>
          <div className="bg-white rounded-lg shadow p-6">
            {isLoading ? (
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