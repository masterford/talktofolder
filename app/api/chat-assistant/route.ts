import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { PineconeAssistantService } from "@/lib/pinecone-assistant"

const assistantService = new PineconeAssistantService()

export async function POST(request: Request) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { message, folderId, chatId } = await request.json()

    if (!message || !folderId || !chatId) {
      return NextResponse.json({ 
        error: "Missing required fields: message, folderId, chatId" 
      }, { status: 400 })
    }

    // Verify chat belongs to user
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        folder: {
          userId: session.user.id,
        },
      },
      include: {
        folder: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 10, // Include last 10 messages for context
        },
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Store user message first
    const userMessage = await prisma.message.create({
      data: {
        chatId,
        role: "user",
        content: message,
      },
    })

    try {
      // Get conversation history for context
      const conversationHistory = chat.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      // Chat with Pinecone Assistant
      console.log(`Chatting with assistant for user ${session.user.id}, folder ${chat.folder.id}`)
      const assistantResponse = await assistantService.chatWithAssistant(
        session.user.id,
        chat.folder.id, // Use internal folder ID
        message,
        conversationHistory
      )


      // Extract the assistant's response
      const aiResponse = assistantResponse.message?.content || 
                        "I'm sorry, I couldn't generate a response based on your documents."

      // Store AI response - Assistant handles citations internally
      const assistantMessage = await prisma.message.create({
        data: {
          chatId,
          role: "assistant",
          content: aiResponse,
          // Note: Pinecone Assistant handles citations internally
          // We could parse the response to extract them if needed
        },
      })

      // Update chat timestamp
      await prisma.chat.update({
        where: { id: chatId },
        data: {}, // This will trigger updatedAt
      })

      return NextResponse.json({
        response: aiResponse,
        messageId: assistantMessage.id,
        // Include assistant response metadata if available
        metadata: assistantResponse.usage || null,
      })

    } catch (assistantError) {
      console.error("Assistant chat error:", assistantError)
      
      // Store error message
      const errorMessage = await prisma.message.create({
        data: {
          chatId,
          role: "assistant", 
          content: "I'm sorry, there was an error processing your request. Please make sure your documents are indexed and try again. If the issue persists, the Pinecone Assistant service may need to be configured.",
        },
      })

      return NextResponse.json({
        response: errorMessage.content,
        messageId: errorMessage.id,
        error: "Assistant processing error",
      })
    }

  } catch (error) {
    console.error("Error in assistant chat API:", error)
    return NextResponse.json({
      error: "Failed to process chat message",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}