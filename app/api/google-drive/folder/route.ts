import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { google } from "googleapis"

export async function POST(request: Request) {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { folderUrl } = await request.json()

    // Extract folder ID from URL
    const folderIdMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (!folderIdMatch) {
      return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 })
    }

    const folderId = folderIdMatch[1]

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

    // Initialize Google Drive client
    const oauth2Client = new google.auth.OAuth2()
    oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
    })

    const drive = google.drive({ version: "v3", auth: oauth2Client })

    try {
      // Get folder details
      const folderResponse = await drive.files.get({
        fileId: folderId,
        fields: "id,name,createdTime,modifiedTime,mimeType",
      })

      const folder = folderResponse.data

      // Verify it's actually a folder
      if (folder.mimeType !== "application/vnd.google-apps.folder") {
        return NextResponse.json({ error: "The provided URL is not a folder" }, { status: 400 })
      }

      // Get file count
      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id)",
        pageSize: 1000,
      })

      const fileCount = filesResponse.data.files?.length || 0

      // Save folder to database
      const savedFolder = await prisma.folder.create({
        data: {
          userId: session.user.id,
          driveId: folder.id!,
          name: folder.name!,
          indexStatus: "pending",
        },
      })

      return NextResponse.json({
        folder: {
          id: savedFolder.id,
          name: folder.name!,
          driveId: folder.id!,
          fileCount,
          lastIndexed: folder.modifiedTime!,
          indexStatus: "pending",
        },
      })
    } catch (driveError: any) {
      console.error("Google Drive API error:", driveError)
      
      if (driveError.code === 404) {
        return NextResponse.json({ error: "Folder not found or you don't have access" }, { status: 404 })
      }
      
      if (driveError.code === 401) {
        return NextResponse.json({ error: "Access token expired" }, { status: 401 })
      }
      
      return NextResponse.json({ 
        error: "Failed to access folder", 
        details: driveError.message 
      }, { status: 500 })
    }
  } catch (error) {
    console.error("Error adding folder:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}