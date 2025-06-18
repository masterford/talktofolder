interface FolderListItemProps {
  folder: {
    id: string
    name: string
    mimeType: string
    modifiedTime: string
  }
  onFolderClick: (folderId: string) => void
}

export default function FolderListItem({ folder, onFolderClick }: FolderListItemProps) {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div 
      className="group relative p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
      onClick={() => onFolderClick(folder.id)}
    >
      <div className="flex items-start space-x-3">
        <span className="text-2xl flex-shrink-0">📁</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {folder.name}
          </p>
          <p className="text-xs text-gray-500">
            Folder • {formatDate(folder.modifiedTime)}
          </p>
        </div>
      </div>
      
      {/* Hover actions */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  )
}