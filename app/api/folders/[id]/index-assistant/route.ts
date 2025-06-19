import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { PineconeAssistantService } from "@/lib/pinecone-assistant"
import { FileProcessor } from "@/lib/file-processor"
import { google } from "googleapis"

const assistantService = new PineconeAssistantService()

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

    // Get folder and files from database
    const folder = await prisma.folder.findFirst({
      where: {
        driveId: folderId,
        userId: session.user.id,
      },
      include: {
        files: true,
      },
    })

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    // Update folder status to processing
    await prisma.folder.update({
      where: { id: folder.id },
      data: { 
        indexStatus: 'processing',
        lastIndexed: new Date(),
      },
    })

    const indexingResults = []
    let successCount = 0
    let errorCount = 0

    // Create or get assistant for this user
    try {
      console.log(`Creating/getting assistant for user ${session.user.id}`)
      const { assistant, existed } = await assistantService.createOrGetAssistant(
        session.user.id
      )
      console.log(`Assistant ${existed ? 'found' : 'created'} successfully`)
    } catch (error) {
      console.error('Error creating assistant:', error)
      return NextResponse.json({
        error: "Failed to create assistant",
        details: error instanceof Error ? error.message : String(error)
      }, { status: 500 })
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

    const fileProcessor = new FileProcessor(oauth2Client)

    // Process each file
    for (const file of folder.files) {
      try {
        console.log(`Processing file: ${file.name}`)
        
        // Process the file to extract content
        const processedFile = await fileProcessor.processFile(
          file.driveId,
          file.name,
          file.mimeType
        )

        if (!processedFile.content.trim()) {
          indexingResults.push({
            fileId: file.id,
            fileName: file.name,
            status: 'skipped',
            reason: 'No content extracted',
          })
          continue
        }

        // Upload content to Pinecone Assistant
        await assistantService.uploadFileContentToAssistant(
          session.user.id,
          folder.id,
          processedFile.content,
          file.name,
          {
            fileId: file.id,
            mimeType: file.mimeType,
            driveId: file.driveId,
          }
        )

        // Update file status in database
        await prisma.file.update({
          where: { id: file.id },
          data: { indexed: true },
        })

        indexingResults.push({
          fileId: file.id,
          fileName: file.name,
          status: 'success',
        })
        successCount++

        // Add delay to avoid rate limits and allow file processing
        await new Promise(resolve => setTimeout(resolve, 3000))
        
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error)
        indexingResults.push({
          fileId: file.id,
          fileName: file.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        errorCount++
      }
    }

    // Update folder status based on results
    const finalStatus = successCount > 0 && errorCount === 0 ? 'completed' : 
                       successCount > 0 ? 'partial' : 'failed'

    await prisma.folder.update({
      where: { id: folder.id },
      data: { 
        indexStatus: finalStatus,
        lastIndexed: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: `Processed ${folder.files.length} files`,
      successCount,
      errorCount,
      status: finalStatus,
      results: indexingResults,
    })

  } catch (error) {
    console.error("Error in assistant folder indexing:", error)
    return NextResponse.json({
      error: "Failed to index folder with assistant",
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 })
  }
}