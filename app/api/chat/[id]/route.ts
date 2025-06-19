import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { PineconeAssistantService } from "@/lib/pinecone-assistant"

const assistantService = new PineconeAssistantService()

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const params = await context.params
    const chatId = params.id

    // Get the chat and verify ownership
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        folder: {
          userId: session.user.id
        }
      },
      include: {
        folder: true,
        messages: true
      }
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Delete files from Pinecone Assistant
    try {
      console.log(`Deleting Pinecone files for folder ${chat.folder.id}`)
      await assistantService.deleteFilesForFolder(session.user.id, chat.folder.id)
    } catch (error) {
      console.error("Error deleting Pinecone files:", error)
      // Continue with chat deletion even if Pinecone deletion fails
    }

    // Delete all messages in the chat
    await prisma.message.deleteMany({
      where: {
        chatId: chatId
      }
    })

    // Delete the chat
    await prisma.chat.delete({
      where: {
        id: chatId
      }
    })

    // Reset the folder's index status to pending
    await prisma.folder.update({
      where: {
        id: chat.folder.id
      },
      data: {
        indexStatus: 'pending',
        lastIndexed: null
      }
    })

    // Reset all files' indexed status
    await prisma.file.updateMany({
      where: {
        folderId: chat.folder.id
      },
      data: {
        indexed: false
      }
    })

    return NextResponse.json({ 
      success: true,
      message: "Chat deleted successfully"
    })

  } catch (error) {
    console.error("Error deleting chat:", error)
    return NextResponse.json({ 
      error: "Failed to delete chat", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}