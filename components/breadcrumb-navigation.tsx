import { useRouter } from "next/navigation"

interface BreadcrumbItem {
  id: string
  name: string
  isRoot: boolean
}

interface BreadcrumbNavigationProps {
  breadcrumbs: BreadcrumbItem[]
}

export default function BreadcrumbNavigation({ breadcrumbs }: BreadcrumbNavigationProps) {
  const router = useRouter()

  const handleBreadcrumbClick = (folderId: string) => {
    router.push(`/chat/${folderId}`)
  }

  if (breadcrumbs.length <= 1) {
    return null
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-gray-600 mb-4">
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.id} className="flex items-center">
          {index > 0 && (
            <svg 
              className="w-4 h-4 mx-1 text-gray-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-gray-900 truncate max-w-[200px]">
              {crumb.name}
            </span>
          ) : (
            <button
              onClick={() => handleBreadcrumbClick(crumb.id)}
              className="hover:text-gray-900 hover:underline truncate max-w-[200px]"
            >
              {crumb.name}
            </button>
          )}
        </div>
      ))}
    </nav>
  )
}