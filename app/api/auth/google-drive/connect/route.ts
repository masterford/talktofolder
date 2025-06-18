import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { google } from "googleapis"

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/google-drive/callback`
    )

    const scopes = ['https://www.googleapis.com/auth/drive.readonly']

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: session.user.id, // Pass user ID to link the account later
      prompt: 'consent',
    })

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error("Error generating auth URL:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}