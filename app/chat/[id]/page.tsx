import { auth } from "@/auth"
import { redirect } from "next/navigation"
import ChatInterface from "@/components/chat-interface"

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  
  if (!session) {
    redirect("/auth/signin")
  }

  const { id } = await params

  return <ChatInterface folderId={id} />
}