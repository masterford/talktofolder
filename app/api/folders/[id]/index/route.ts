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
    
    // Get the folder and its files
    const folder = await prisma.folder.findFirst({
      where: {
        driveId: folderId,
        userId: session.user.id,
      },
      include: {
        files: {
          where: {
            indexed: false, // Only get unindexed files
          },
        },
      },
    })

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 })
    }

    const unindexedFiles = folder.files
    
    if (unindexedFiles.length === 0) {
      return NextResponse.json({ 
        message: "All files in folder are already indexed",
        folderId: folder.id,
        totalFiles: 0,
        indexedFiles: 0,
      })
    }

    // Update folder status to indicate indexing is in progress
    await prisma.folder.update({
      where: { id: folder.id },
      data: { indexStatus: "processing" },
    })

    // Start indexing files (this could be moved to a background job)
    const indexingResults = []
    let successCount = 0
    let errorCount = 0

    for (const file of unindexedFiles) {
      try {
        // Call the individual file indexing endpoint
        const indexResponse = await fetch(
          `${process.env.NEXTAUTH_URL}/api/files/${file.id}/index`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Pass along authentication - in a real app you'd handle this differently
              'Cookie': request.headers.get('Cookie') || '',
            },
          }
        )

        if (indexResponse.ok) {
          const result = await indexResponse.json()
          indexingResults.push({
            fileId: file.id,
            fileName: file.name,
            status: 'success',
            chunkCount: result.chunkCount,
          })
          successCount++
        } else {
          const error = await indexResponse.json()
          indexingResults.push({
            fileId: file.id,
            fileName: file.name,
            status: 'error',
            error: error.error,
          })
          errorCount++
        }
      } catch (error) {
        indexingResults.push({
          fileId: file.id,
          fileName: file.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        errorCount++
      }
    }

    // Update folder status
    const finalStatus = errorCount === 0 ? "completed" : (successCount > 0 ? "partial" : "failed")
    await prisma.folder.update({
      where: { id: folder.id },
      data: { 
        indexStatus: finalStatus,
        lastIndexed: new Date(),
      },
    })

    return NextResponse.json({
      message: `Folder indexing completed`,
      folderId: folder.id,
      folderName: folder.name,
      totalFiles: unindexedFiles.length,
      successCount,
      errorCount,
      results: indexingResults,
    })

  } catch (error) {
    console.error("Error indexing folder:", error)
    
    // Try to update folder status to failed
    try {
      const currentSession = await auth()
      if (currentSession?.user?.id) {
        const params = await context.params
        const folderId = params.id
        const folder = await prisma.folder.findFirst({
          where: {
            driveId: folderId,
            userId: currentSession.user.id,
          },
        })
        
        if (folder) {
          await prisma.folder.update({
            where: { id: folder.id },
            data: { indexStatus: "failed" },
          })
        }
      }
    } catch (updateError) {
      console.error("Error updating folder status:", updateError)
    }

    return NextResponse.json({ 
      error: "Failed to index folder", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}