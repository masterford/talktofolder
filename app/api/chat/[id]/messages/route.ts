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
    const chatId = params.id

    // Verify chat belongs to user and get messages
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        folder: {
          userId: session.user.id,
        },
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    return NextResponse.json({
      messages: chat.messages,
    })

  } catch (error) {
    console.error("Error fetching messages:", error)
    return NextResponse.json({
      error: "Failed to fetch messages",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}