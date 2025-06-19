"use client"

import { useState } from "react"

interface SidePanelProps {
  fileId: string | null
  fileName: string | null
  mimeType: string | null
  webViewLink: string | null
  isExpanded?: boolean
  onClose: () => void
}

export default function SidePanel({ fileId, fileName, mimeType, webViewLink, isExpanded = false, onClose }: SidePanelProps) {
  const [isLoading, setIsLoading] = useState(true)

  if (!fileId || !webViewLink) return null

  const getFileIcon = (mimeType: string): string => {
    if (mimeType?.includes('google-apps.document') || mimeType?.includes('word')) return '📄'
    if (mimeType?.includes('google-apps.spreadsheet') || mimeType?.includes('excel')) return '📊'
    if (mimeType?.includes('pdf')) return '📕'
    if (mimeType?.includes('csv')) return '📊'
    if (mimeType?.includes('markdown') || fileName?.endsWith('.md')) return '📝'
    if (mimeType?.includes('text')) return '📝'
    return '📋'
  }


  return (
    <div className={`${isExpanded ? 'flex-1' : 'w-96'} bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          <span className="text-xl flex-shrink-0">{getFileIcon(mimeType || '')}</span>
          <h3 className="font-medium text-gray-900 truncate" title={fileName || undefined}>
            {fileName || "File Preview"}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1"
          title="Close preview"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
              <p className="text-gray-600">Loading preview...</p>
            </div>
          </div>
        )}
        <iframe
          src={webViewLink}
          className="w-full h-full border-0"
          title={fileName || "File Preview"}
          onLoad={() => setIsLoading(false)}
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-downloads"
          allow="cross-origin-isolated"
        />
      </div>
    </div>
  )
}