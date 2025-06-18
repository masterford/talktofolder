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
      
      // Check if it's a ToS error - fallback to original vector search
      if (assistantError instanceof Error && assistantError.message.includes("Terms of service")) {
        console.log("ToS not accepted, falling back to vector search...")
        
        try {
          // Import the original vector store approach
          const { VectorStore } = await import('@/lib/vector-store')
          const vectorStore = new VectorStore()
          
          // Search for relevant context using vector search
          const searchResults = await vectorStore.searchSimilar(
            message,
            session.user.id,
            {
              folderId: chat.folder.id, // Use internal folder ID
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

          // Generate AI response using OpenAI (fallback)
          const { default: OpenAI } = await import('openai')
          const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
          })

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
            fallback: "vector-search", // Indicate fallback was used
          })
          
        } catch (fallbackError) {
          console.error("Fallback error:", fallbackError)
          // Continue to original error handling below
        }
      }
      
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