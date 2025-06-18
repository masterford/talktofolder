import { NextResponse } from "next/server"
import { google } from "googleapis"
import { prisma } from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state") // This is the user ID
    const error = searchParams.get("error")


    if (error) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=drive_access_denied`)
    }

    if (!code || !state) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=invalid_callback`)
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/auth/google-drive/callback`
    )

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)

    // Find the user's account by user ID (from state) instead of using userinfo
    const userAccount = await prisma.account.findFirst({
      where: {
        userId: state,
        provider: "google",
      },
    })

    if (!userAccount) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=no_account_found`)
    }

    // Update the existing account with Drive tokens
    await prisma.account.update({
      where: {
        id: userAccount.id,
      },
      data: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : null,
        scope: tokens.scope,
      },
    })

    // Create a record to track that this user has connected Drive
    await prisma.user.update({
      where: { id: state },
      data: {
        updatedAt: new Date(), // Just to track when Drive was connected
      },
    })

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?drive_connected=true`)
  } catch (error) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=drive_connection_failed`)
  }
}