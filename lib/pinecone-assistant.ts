import { Pinecone } from '@pinecone-database/pinecone'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
})

export class PineconeAssistantService {
  private getAssistantName(userId: string, folderId: string): string {
    // Create a unique assistant name per user per folder
    return `user-${userId}-folder-${folderId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
  }

  async createOrGetAssistant(userId: string, folderId: string, folderName: string) {
    const assistantName = this.getAssistantName(userId, folderId)
    
    try {
      // Try to get existing assistant
      const existing = await pinecone.describeAssistant(assistantName)
      return { assistant: pinecone.Assistant(assistantName), existed: true }
    } catch (error) {
      // Assistant doesn't exist, create new one
      try {
        console.log(`Creating new assistant: ${assistantName}`)
        const assistant = await pinecone.createAssistant({
          name: assistantName,
          instructions: `You are an AI assistant helping users understand and work with documents in their Google Drive folder "${folderName}". Answer questions based on the uploaded documents. Be helpful, accurate, and cite specific documents when referencing information.`
        })
        
        console.log('Assistant created, waiting for readiness...')
        // Wait a bit longer for assistant to be ready (as per Pinecone docs)
        await new Promise(resolve => setTimeout(resolve, 10000))
        
        return { assistant: pinecone.Assistant(assistantName), existed: false }
      } catch (createError) {
        console.error('Error creating assistant:', createError)
        throw createError
      }
    }
  }

  async uploadFileToAssistant(
    userId: string, 
    folderId: string, 
    filePath: string, 
    fileName: string,
    metadata: Record<string, any> = {}
  ) {
    const { assistant } = await this.createOrGetAssistant(userId, folderId, '')
    
    try {
      await assistant.uploadFile({
        path: filePath,
        metadata: {
          userId,
          folderId,
          fileName,
          uploadedAt: new Date().toISOString(),
          ...metadata
        }
      })
      
      console.log(`File ${fileName} uploaded to assistant`)
      
      return true
    } catch (error) {
      console.error(`Error uploading file ${fileName}:`, error)
      throw error
    }
  }

  async uploadFileContentToAssistant(
    userId: string,
    folderId: string,
    content: string,
    fileName: string,
    metadata: Record<string, any> = {}
  ) {
    const { assistant } = await this.createOrGetAssistant(userId, folderId, '')
    
    try {
      // Create a temporary file for the content
      const fs = await import('fs')
      const path = await import('path')
      const os = await import('os')
      
      const tempDir = os.tmpdir()
      // Sanitize filename to remove invalid characters for filesystem
      const sanitizedFileName = fileName.replace(/[/\\:*?"<>|]/g, '-')
      const tempFilePath = path.join(tempDir, `${Date.now()}-${sanitizedFileName}.txt`)
      
      await fs.promises.writeFile(tempFilePath, content, 'utf-8')
      
      await assistant.uploadFile({
        path: tempFilePath,
        metadata: {
          userId,
          folderId,
          fileName,
          uploadedAt: new Date().toISOString(),
          ...metadata
        }
      })
      
      // Clean up temp file
      try {
        await fs.promises.unlink(tempFilePath)
      } catch (unlinkError) {
        console.warn(`Could not delete temp file ${tempFilePath}:`, unlinkError)
      }
      
      console.log(`File content ${fileName} uploaded to assistant`)
      
      return true
    } catch (error) {
      console.error(`Error uploading file content ${fileName}:`, error)
      throw error
    }
  }

  async chatWithAssistant(
    userId: string,
    folderId: string,
    message: string,
    conversationHistory: { role: string; content: string }[] = []
  ) {
    const { assistant } = await this.createOrGetAssistant(userId, folderId, '')
    
    try {
      // Build messages array including conversation history
      const messages = [
        ...conversationHistory.map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        })),
        { role: 'user' as const, content: message }
      ]

      console.log('Sending chat request to assistant with messages:', messages.length)
      const response = await assistant.chat({
        messages
      })
      
      console.log('Assistant chat response received')
      return response
    } catch (error) {
      console.error('Error chatting with assistant:', error)
      throw error
    }
  }

  async deleteAssistant(userId: string, folderId: string) {
    const assistantName = this.getAssistantName(userId, folderId)
    
    try {
      await pinecone.deleteAssistant(assistantName)
      console.log(`Assistant ${assistantName} deleted`)
      return true
    } catch (error) {
      console.error(`Error deleting assistant ${assistantName}:`, error)
      return false
    }
  }

  async listAssistantFiles(userId: string, folderId: string) {
    const { assistant } = await this.createOrGetAssistant(userId, folderId, '')
    
    try {
      const files = await assistant.listFiles()
      return files
    } catch (error) {
      console.error('Error listing assistant files:', error)
      throw error
    }
  }
}