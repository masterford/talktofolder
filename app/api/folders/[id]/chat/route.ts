import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
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
    
    // Get the folder from database
    const folder = await prisma.folder.findFirst({
      where: {
        driveId: folderId,
        userId: session.user.id,
      },
    })

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Upsert chat entry to ensure one chat per folder and update access time
    const chat = await prisma.chat.upsert({
      where: {
        folderId: folder.id,
      },
      update: {
        // Just update the updatedAt timestamp by touching the record
      },
      create: {
        folderId: folder.id,
      },
    })


    return NextResponse.json({ 
      chatId: chat.id,
      folderId: folder.id,
      folderName: folder.name,
    })

  } catch (error) {
    console.error("Error creating/accessing chat:", error)
    return NextResponse.json({ 
      error: "Failed to create chat session", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}