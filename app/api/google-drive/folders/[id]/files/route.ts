import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { google } from "googleapis"

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
    const folderId = params.id
    
    

    // Get the user's account to retrieve access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
    })


    if (!account?.access_token) {
      return NextResponse.json({ error: "No Google access token found" }, { status: 400 })
    }

    // Initialize Google Drive client with proper configuration
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
    )
    
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })

    const drive = google.drive({ version: "v3", auth: oauth2Client })

    try {
      // First, get folder details to save in database
      const folderResponse = await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,parents",
      })

      if (folderResponse.data.mimeType !== "application/vnd.google-apps.folder") {
        return NextResponse.json({ error: "Not a folder" }, { status: 400 })
      }

      // Handle parent folder relationship
      let parentFolderId = null
      if (folderResponse.data.parents && folderResponse.data.parents.length > 0) {
        const parentDriveId = folderResponse.data.parents[0]
        
        // Check if parent folder exists in our database
        const parentFolder = await prisma.folder.findFirst({
          where: {
            driveId: parentDriveId,
            userId: session.user.id,
          },
        })
        
        if (parentFolder) {
          parentFolderId = parentFolder.id
        }
      }

      // Save or update folder in database
      let folder = await prisma.folder.findFirst({
        where: {
          driveId: folderId,
          userId: session.user.id,
        },
      })

      if (folder) {
        folder = await prisma.folder.update({
          where: { id: folder.id },
          data: {
            name: folderResponse.data.name!,
            parentId: parentFolderId,
            lastIndexed: new Date(),
          },
        })
      } else {
        folder = await prisma.folder.create({
          data: {
            userId: session.user.id,
            driveId: folderId,
            name: folderResponse.data.name!,
            parentId: parentFolderId,
            indexStatus: "pending",
          },
        })
      }

      // Fetch files and folders from the folder
      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)",
        pageSize: 1000,
      })

      const allItems = filesResponse.data.files || []
      
      // Separate files and folders
      const files = allItems.filter(item => item.mimeType !== "application/vnd.google-apps.folder")
      const subfolders = allItems.filter(item => item.mimeType === "application/vnd.google-apps.folder")


      // Filter for supported file types - docs, PDFs, and CSV/sheets only
      const supportedMimeTypes = [
        'application/pdf',
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.ms-excel',
        'text/csv',
      ]

      const supportedFiles = files.filter(file => {
        if (!file.mimeType) return false
        return supportedMimeTypes.includes(file.mimeType)
      })


      // Save files to database
      if (supportedFiles.length > 0) {
        await Promise.all(
          supportedFiles.map(async (file) => {
            const existingFile = await prisma.file.findFirst({
              where: {
                driveId: file.id!,
                folderId: folder.id,
              },
            })

            if (existingFile) {
              await prisma.file.update({
                where: { id: existingFile.id },
                data: {
                  name: file.name!,
                  mimeType: file.mimeType!,
                  size: file.size ? BigInt(file.size) : BigInt(0),
                  lastModified: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
                },
              })
            } else {
              await prisma.file.create({
                data: {
                  folderId: folder.id,
                  driveId: file.id!,
                  name: file.name!,
                  mimeType: file.mimeType!,
                  size: file.size ? BigInt(file.size) : BigInt(0),
                  lastModified: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
                  indexed: false,
                },
              })
            }
          })
        )
      }

      // Get indexed status for files from database
      const dbFiles = await prisma.file.findMany({
        where: {
          folderId: folder.id,
        },
        select: {
          driveId: true,
          indexed: true,
          id: true,
        },
      })

      const indexStatusMap = new Map(
        dbFiles.map(dbFile => [dbFile.driveId, { indexed: dbFile.indexed, id: dbFile.id }])
      )

      // Format response
      const formattedFiles = supportedFiles.map(file => ({
        id: indexStatusMap.get(file.id!)?.id || file.id,
        driveId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || 0,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        indexed: indexStatusMap.get(file.id!)?.indexed || false,
      }))

      // Format subfolders response
      const formattedSubfolders = subfolders.map(subfolder => ({
        id: subfolder.id,
        name: subfolder.name,
        mimeType: subfolder.mimeType,
        modifiedTime: subfolder.modifiedTime,
      }))

      return NextResponse.json({
        folder: {
          id: folder.id,
          name: folder.name,
          driveId: folder.driveId,
          indexStatus: folder.indexStatus,
        },
        files: formattedFiles,
        subfolders: formattedSubfolders,
        totalFiles: files.length,
        supportedFiles: supportedFiles.length,
        totalSubfolders: subfolders.length,
      })
    } catch (driveError: any) {
      
      // Check if token is expired
      if (driveError.code === 401 || driveError.message?.includes('invalid_request')) {
        return NextResponse.json({ error: "Authentication expired. Please reconnect Google Drive." }, { status: 401 })
      }
      
      return NextResponse.json({ 
        error: "Failed to fetch files", 
        details: driveError.message 
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({ 
      error: "Internal server error", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}