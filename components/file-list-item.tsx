interface FileListItemProps {
  file: {
    id: string
    name: string
    mimeType: string
    size: number
    modifiedTime: string
    webViewLink?: string
    iconLink?: string
    indexed?: boolean
  }
  onIndex?: (fileId: string) => void
}

export default function FileListItem({ file, onIndex }: FileListItemProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (mimeType: string): string => {
    // Google Workspace files
    if (mimeType.includes('google-apps.document')) return '📄'
    if (mimeType.includes('google-apps.spreadsheet')) return '📊'
    
    // Microsoft Office files
    if (mimeType.includes('word') || mimeType.includes('document')) return '📄'
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊'
    
    // Other file types
    if (mimeType.includes('pdf')) return '📕'
    if (mimeType.includes('csv')) return '📊'
    
    return '📋'
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="group relative p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer">
      <div className="flex items-start space-x-3">
        <span className="text-2xl flex-shrink-0">{getFileIcon(file.mimeType)}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500">
            {formatFileSize(file.size)} • {formatDate(file.modifiedTime)}
            {file.indexed !== undefined && (
              <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                file.indexed 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {file.indexed ? 'Indexed' : 'Not indexed'}
              </span>
            )}
          </p>
        </div>
      </div>
      
      {/* Hover actions */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1">
        {onIndex && !file.indexed && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onIndex(file.id)
            }}
            className="p-1 text-blue-400 hover:text-blue-600"
            title="Index file"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 1.79 4 4 4h8c2.21 0 4-1.79 4-4V7M4 7c0-2.21 1.79-4 4-4h8c2.21 0 4-1.79 4-4M4 7h16m-1 4l-3 3m0 0l-3-3m3 3V8" />
            </svg>
          </button>
        )}
        {file.webViewLink && (
          <a
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-gray-600"
            title="Open in Google Drive"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}