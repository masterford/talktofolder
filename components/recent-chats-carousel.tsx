"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface RecentChat {
  id: string
  folderId: string
  folderName: string
  indexStatus: string
  messageCount: number
  lastAccessed: string
}

export default function RecentChatsCarousel() {
  const [recentChats, setRecentChats] = useState<RecentChat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchRecentChats = async () => {
      try {
        const response = await fetch('/api/chats/recent')
        if (response.ok) {
          const data = await response.json()
          setRecentChats(data.chats || [])
        }
      } catch (error) {
        console.error('Error fetching recent chats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentChats()
  }, [])

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return 'Today'
    if (diffDays === 2) return 'Yesterday'
    if (diffDays <= 7) return `${diffDays - 1} days ago`
    return date.toLocaleDateString()
  }

  const getStatusBadge = (status: string) => {
    const colors = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-blue-100 text-blue-800',
      partial: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-gray-100 text-gray-800',
    }
    
    const labels = {
      completed: 'Indexed',
      processing: 'Indexing',
      partial: 'Partial',
      failed: 'Failed',
      pending: 'Pending',
    }

    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[status as keyof typeof colors] || colors.pending}`}>
        {labels[status as keyof typeof labels] || 'Unknown'}
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
        <p className="text-gray-500 mt-2 text-sm">Loading recent chats...</p>
      </div>
    )
  }

  if (recentChats.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No recent chats found. Start by opening a folder below!</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex space-x-4 pb-4">
        {recentChats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => router.push(`/chat/${chat.folderId}`)}
            className="flex-shrink-0 w-72 bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
          >
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900 truncate flex-1">
                  {chat.folderName}
                </h3>
                {getStatusBadge(chat.indexStatus)}
              </div>
              
              <div className="text-sm text-gray-500 space-y-1">
                <p>
                  {chat.messageCount > 0 
                    ? `${chat.messageCount} message${chat.messageCount !== 1 ? 's' : ''}`
                    : 'No messages yet'
                  }
                </p>
                <p>Last accessed: {formatDate(chat.lastAccessed)}</p>
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Click to continue chat
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.955 8.955 0 01-4.126-.98L3 20l1.98-5.874A8.955 8.955 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}