import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { google } from "googleapis"
import { FileProcessor } from "@/lib/file-processor"
import { TextChunker } from "@/lib/text-chunker"
import { VectorStore } from "@/lib/vector-store"
import { initializePineconeIndex } from "@/lib/pinecone"

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
    const fileId = params.id
    
    // Get the file from database
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        folder: {
          userId: session.user.id,
        },
      },
      include: {
        folder: true,
      },
    })

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    if (file.indexed) {
      return NextResponse.json({ 
        message: "File already indexed",
        fileId: file.id,
        indexed: true 
      })
    }

    // Get the user's Google Drive access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    })

    if (!account?.access_token) {
      return NextResponse.json({ error: "No Google access token found" }, { status: 400 })
    }

    // Initialize Google Drive client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    )
    
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })

    // Mark file as being processed
    await prisma.file.update({
      where: { id: fileId },
      data: { indexed: false }, // Still processing
    })

    try {
      // Process the file
      const fileProcessor = new FileProcessor(oauth2Client)
      const processedFile = await fileProcessor.processFile(
        file.driveId,
        file.name,
        file.mimeType
      )

      // Chunk the text
      const textChunker = new TextChunker()
      const chunks = textChunker.chunkByTokens(processedFile.content, 500, 50)

      if (chunks.length === 0) {
        await prisma.file.update({
          where: { id: fileId },
          data: { indexed: true },
        })
        
        return NextResponse.json({
          message: "File processed but no content to index",
          fileId: file.id,
          indexed: true,
          chunkCount: 0
        })
      }

      // Initialize Pinecone index if it doesn't exist
      await initializePineconeIndex()
      
      // Index in vector store
      const vectorStore = new VectorStore()
      await vectorStore.indexFileChunks(
        file.id,
        file.name,
        file.folder.id,
        file.folder.name,
        session.user.id,
        file.mimeType,
        chunks
      )

      // Save chunk metadata to database (without content)
      const chunkData = chunks.map(chunk => ({
        fileId: file.id,
        embedding: JSON.stringify([]), // We store embeddings in Pinecone, not DB
        chunkIndex: chunk.chunkIndex,
        pageNumber: null, // Could be enhanced to track page numbers for PDFs
      }))

      await prisma.chunk.createMany({
        data: chunkData,
      })

      // Mark file as indexed
      await prisma.file.update({
        where: { id: fileId },
        data: { indexed: true },
      })

      return NextResponse.json({
        message: "File indexed successfully",
        fileId: file.id,
        indexed: true,
        chunkCount: chunks.length,
        contentLength: processedFile.content.length,
      })

    } catch (processingError) {
      // Mark file as failed (not indexed)
      await prisma.file.update({
        where: { id: fileId },
        data: { indexed: false },
      })
      
      throw processingError
    }

  } catch (error) {
    console.error("Error indexing file:", error)
    return NextResponse.json({ 
      error: "Failed to index file", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}