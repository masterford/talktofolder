import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = await context.params
    const folderId = params.id
    
    // Get the current folder
    const currentFolder = await prisma.folder.findFirst({
      where: {
        driveId: folderId,
        userId: session.user.id,
      },
      include: { parent: true },
    })

    if (!currentFolder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Build breadcrumb path by traversing up the hierarchy
    const breadcrumbs = []
    let folder: typeof currentFolder | null = currentFolder

    // Traverse up the hierarchy
    while (folder) {
      breadcrumbs.unshift({
        id: folder.driveId,
        name: folder.name,
        isRoot: !folder.parentId,
      })

      if (folder.parent) {
        folder = await prisma.folder.findUnique({
          where: { id: folder.parent.id },
          include: { parent: true },
        })
      } else {
        folder = null
      }
    }

    return NextResponse.json({ breadcrumbs })
  } catch (error) {
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}