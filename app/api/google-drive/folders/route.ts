import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { google } from "googleapis"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageToken = searchParams.get("pageToken") || undefined
  const pageSize = parseInt(searchParams.get("pageSize") || "10")
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
      // Fetch folders from Google Drive with pagination
      const foldersResponse = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.folder' and 'me' in owners and trashed=false",
        fields: "nextPageToken,files(id,name,createdTime,modifiedTime)",
        pageSize,
        pageToken,
      })

      const folders = foldersResponse.data.files || []
      const nextPageToken = foldersResponse.data.nextPageToken
      
      // Fetch file count for each folder
      const foldersWithCounts = await Promise.all(
        folders.map(async (folder) => {
          try {
            const filesResponse = await drive.files.list({
              q: `'${folder.id}' in parents and trashed=false`,
              fields: "files(id)",
              pageSize: 1000,
            })
            
            const fileCount = filesResponse.data.files?.length || 0
            
            return {
              id: folder.id!,
              name: folder.name!,
              driveId: folder.id!,
              fileCount,
              lastIndexed: folder.modifiedTime!,
              indexStatus: "pending",
            }
          } catch (error) {
            console.error(`Error fetching files for folder ${folder.name}:`, error)
            return {
              id: folder.id!,
              name: folder.name!,
              driveId: folder.id!,
              fileCount: 0,
              lastIndexed: folder.modifiedTime!,
              indexStatus: "pending",
            }
          }
        })
      )


      // Get any folders saved in the database for this user
      const savedFolders = await prisma.folder.findMany({
        where: { userId: session.user.id },
        select: { driveId: true },
      })
      const savedFolderIds = new Set(savedFolders.map(f => f.driveId))

      // Mark folders that are already saved
      const foldersWithSavedStatus = foldersWithCounts.map(folder => ({
        ...folder,
        isSaved: savedFolderIds.has(folder.driveId),
      }))

      return NextResponse.json({ 
        folders: foldersWithSavedStatus,
        nextPageToken
      })
    } catch (driveError: any) {
      console.error("Google Drive API error:", driveError)
      
      // Check if token is expired
      if (driveError.code === 401) {
        return NextResponse.json({ error: "Access token expired" }, { status: 401 })
      }
      
      return NextResponse.json({ 
        error: "Failed to fetch folders", 
        details: driveError.message 
      }, { status: 500 })
    }
  } catch (error) {
    console.error("Error in folders API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}