import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if the user has Drive access token
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "google",
      },
      select: {
        scope: true,
        access_token: true,
      },
    })

    const hasDriveAccess = !!(
      account?.access_token && 
      account?.scope?.includes('https://www.googleapis.com/auth/drive.readonly')
    )

    return NextResponse.json({ 
      connected: hasDriveAccess,
      hasAccount: !!account,
    })
  } catch (error) {
    console.error("Error checking Drive status:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}