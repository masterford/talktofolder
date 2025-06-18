import { useRouter } from "next/navigation"

interface FolderCardProps {
  folder: {
    id: string
    name: string
    fileCount: number
    lastIndexed: string
    indexStatus: string
  }
}

export default function FolderCard({ folder }: FolderCardProps) {
  const router = useRouter()

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return "Less than 1 hour ago"
    if (diffInHours < 24) return `${diffInHours} hours ago`
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays === 1) return "1 day ago"
    return `${diffInDays} days ago`
  }

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow duration-200 p-6">
      <div className="text-center mb-4">
        <span className="text-5xl">📁</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">
        {folder.name}
      </h3>
      <div className="text-sm text-gray-600 text-center space-y-1">
        <p>
          {folder.fileCount === -1 
            ? "Files not counted" 
            : `${folder.fileCount} file${folder.fileCount !== 1 ? 's' : ''}`}
        </p>
        <p>Last modified {formatTimeAgo(folder.lastIndexed)}</p>
      </div>
      <button
        onClick={() => router.push(`/chat/${folder.id}`)}
        className="mt-4 w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 transition-colors"
      >
        Open Chat
      </button>
    </div>
  )
}