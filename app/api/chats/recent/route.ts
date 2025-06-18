import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get recent chats with folder information, deduplicated by folder
    const recentChats = await prisma.chat.findMany({
      where: {
        folder: {
          userId: session.user.id,
        },
      },
      include: {
        folder: true,
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc', // Use updatedAt to reflect most recent access
      },
      take: 10, // Limit to 10 most recent chats
    })

    const formattedChats = recentChats.map(chat => ({
      id: chat.id,
      folderId: chat.folder.driveId,
      folderName: chat.folder.name,
      indexStatus: chat.folder.indexStatus,
      messageCount: chat._count.messages,
      lastAccessed: chat.updatedAt, // Use updatedAt as last accessed time
    }))

    return NextResponse.json({ 
      chats: formattedChats 
    })

  } catch (error) {
    console.error("Error fetching recent chats:", error)
    return NextResponse.json({ 
      error: "Failed to fetch recent chats", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}