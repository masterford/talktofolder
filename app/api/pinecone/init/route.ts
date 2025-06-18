import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { initializePineconeIndex } from "@/lib/pinecone"

export async function POST() {
  try {
    const session = await auth()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Initialize the Pinecone index
    const index = await initializePineconeIndex()
    
    return NextResponse.json({ 
      message: "Pinecone index initialized successfully",
      indexName: process.env.PINECONE_INDEX_NAME || 'talktofolder',
      ready: true
    })

  } catch (error) {
    console.error("Error initializing Pinecone:", error)
    return NextResponse.json({ 
      error: "Failed to initialize Pinecone index", 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}