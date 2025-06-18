import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { VectorStore } from "@/lib/vector-store"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const vectorStore = new VectorStore()

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
      },
    })

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }

    // Search for relevant context using vector search
    const searchResults = await vectorStore.searchSimilar(
      message,
      session.user.id,
      {
        folderId: chat.folder.id, // Use internal folder ID, not driveId
        topK: 5,
        minScore: 0.7,
      }
    )

    // Build context from search results
    const context = searchResults.map(result => ({
      content: result.metadata.chunkText,
      source: {
        fileName: result.metadata.fileName,
        score: result.score,
      },
    }))

    // Store user message
    const userMessage = await prisma.message.create({
      data: {
        chatId,
        role: "user",
        content: message,
      },
    })

    // Generate AI response using OpenAI
    const contextText = context.length > 0 
      ? context.map(c => `${c.source.fileName}: ${c.content}`).join('\n\n')
      : "No relevant documents found in this folder."

    const prompt = `You are an AI assistant helping users understand and work with documents in their Google Drive folder "${chat.folder.name}". 

Based on the following context from the user's documents, please answer their question. If the context doesn't contain relevant information, let them know and suggest they might need to ask about different topics or check if their documents have been properly indexed.

Context from documents:
${contextText}

User question: ${message}

Please provide a helpful response based on the context above. If you reference specific information, mention which document it came from.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      stream: false, // Keep non-streaming for now for simplicity
    })

    const aiResponse = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response."

    // Prepare citations from search results
    const citations = searchResults.map(result => ({
      fileName: result.metadata.fileName,
      fileId: result.metadata.fileId,
      score: result.score,
      chunkIndex: result.metadata.chunkIndex,
    }))

    // Store AI response with citations
    const assistantMessage = await prisma.message.create({
      data: {
        chatId,
        role: "assistant",
        content: aiResponse,
        citations: citations.length > 0 ? citations : undefined,
      },
    })

    // Update chat timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: {}, // This will trigger updatedAt
    })

    return NextResponse.json({
      response: aiResponse,
      citations,
      messageId: assistantMessage.id,
    })

  } catch (error) {
    console.error("Error in chat API:", error)
    return NextResponse.json({
      error: "Failed to process chat message",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}