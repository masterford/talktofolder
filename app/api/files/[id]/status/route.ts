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
    const fileId = params.id
    
    // Get the file with chunk information
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        folder: {
          userId: session.user.id,
        },
      },
      include: {
        chunks: true,
        folder: true,
      },
    })

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    return NextResponse.json({
      fileId: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      size: Number(file.size),
      indexed: file.indexed,
      chunkCount: file.chunks.length,
      folderName: file.folder.name,
      lastModified: file.lastModified,
      createdAt: file.createdAt,
    })

  } catch (error) {
    console.error("Error getting file status:", error)
    return NextResponse.json({ 
      error: "Failed to get file status", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}