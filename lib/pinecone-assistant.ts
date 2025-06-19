import { Pinecone } from '@pinecone-database/pinecone'
import { prisma } from './prisma'

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
})

export class PineconeAssistantService {
  private getAssistantName(userId: string): string {
    // Create a unique assistant name per user (not per folder)
    return `user-${userId}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()
  }

  async createOrGetAssistant(userId: string) {
    // Check if user already has an assistant name stored
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { assistantName: true }
    })

    let assistantName = user?.assistantName

    if (!assistantName) {
      // Generate new assistant name and store it
      assistantName = this.getAssistantName(userId)
      
      await prisma.user.update({
        where: { id: userId },
        data: { assistantName }
      })
    }
    
    try {
      // Try to get existing assistant
      const existing = await pinecone.describeAssistant(assistantName)
      return { assistant: pinecone.Assistant(assistantName), existed: true, assistantName }
    } catch (error) {
      // Assistant doesn't exist, create new one
      try {
        console.log(`Creating new assistant: ${assistantName}`)
        const assistant = await pinecone.createAssistant({
          name: assistantName,
          instructions: `You are an AI assistant helping users understand and work with documents across all their Google Drive folders. Answer questions based on the uploaded documents from any folder. Be helpful, accurate, and cite specific documents when referencing information. When answering questions, consider the context of all uploaded documents.`
        })
        
        console.log('Assistant created, waiting for readiness...')
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        return { assistant: pinecone.Assistant(assistantName), existed: false, assistantName }
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
    const { assistant } = await this.createOrGetAssistant(userId)
    
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
    const { assistant } = await this.createOrGetAssistant(userId)
    
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
    message: string,
    conversationHistory: { role: string; content: string }[] = []
  ) {
    const { assistant } = await this.createOrGetAssistant(userId)
    
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

  async deleteAssistant(userId: string) {
    const { assistantName } = await this.createOrGetAssistant(userId)
    
    try {
      await pinecone.deleteAssistant(assistantName)
      console.log(`Assistant ${assistantName} deleted`)
      
      // Clear the assistant name from the user record
      await prisma.user.update({
        where: { id: userId },
        data: { assistantName: null }
      })
      
      return true
    } catch (error) {
      console.error(`Error deleting assistant ${assistantName}:`, error)
      return false
    }
  }

  async listAssistantFiles(userId: string) {
    const { assistant } = await this.createOrGetAssistant(userId)
    
    try {
      const files = await assistant.listFiles()
      return files
    } catch (error) {
      console.error('Error listing assistant files:', error)
      throw error
    }
  }

  async deleteFilesForFolder(userId: string, folderId: string) {
    const { assistant } = await this.createOrGetAssistant(userId)
    
    try {
      // List all files
      const filesList = await assistant.listFiles()
      const files = filesList.files || []
      
      // Filter files that belong to this folder (check metadata)
      const folderFiles = files.filter((file: any) => {
        return file.metadata?.folderId === folderId || 
               (file.metadata?.batchFileName && file.metadata.folderId === folderId)
      })
      
      console.log(`Found ${folderFiles.length} files to delete for folder ${folderId}`)
      
      // Delete each file
      for (const file of folderFiles) {
        try {
          await assistant.deleteFile(file.id)
          console.log(`Deleted file ${file.name} (${file.id})`)
        } catch (error) {
          console.error(`Error deleting file ${file.name}:`, error)
        }
      }
      
      return folderFiles.length
    } catch (error) {
      console.error('Error deleting files for folder:', error)
      throw error
    }
  }

  async uploadBatchedContent(
    userId: string,
    folderId: string,
    files: Array<{ fileName: string; content: string; metadata?: Record<string, any> }>
  ) {
    const { assistant } = await this.createOrGetAssistant(userId)
    
    const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
    const batches: Array<{ content: string; fileName: string; fileNames: string[] }> = []
    let currentBatch = { content: '', fileName: '', fileNames: [] as string[] }
    let currentSize = 0
    let batchNumber = 1

    // Process files and create batches
    for (const file of files) {
      if (!file.content.trim()) continue

      // Format content with file name as heading
      const formattedContent = `\n\n=== FILE: ${file.fileName} ===\n\n${file.content}\n`
      const contentSize = new TextEncoder().encode(formattedContent).length

      // If adding this file would exceed the limit, start a new batch
      if (currentSize > 0 && currentSize + contentSize > MAX_SIZE_BYTES) {
        currentBatch.fileName = `folder_${folderId}_batch_${batchNumber}.txt`
        batches.push({ ...currentBatch })
        batchNumber++
        currentBatch = { content: '', fileName: '', fileNames: [] }
        currentSize = 0
      }

      // Add file to current batch
      currentBatch.content += formattedContent
      currentBatch.fileNames.push(file.fileName)
      currentSize += contentSize
    }

    // Add the last batch if it has content
    if (currentBatch.content) {
      currentBatch.fileName = `folder_${folderId}_batch_${batchNumber}.txt`
      batches.push(currentBatch)
    }

    console.log(`Created ${batches.length} batches for ${files.length} files`)

    // Upload each batch
    const uploadResults = []
    for (const batch of batches) {
      try {
        // Create a temporary file for the batch
        const fs = await import('fs')
        const path = await import('path')
        const os = await import('os')
        
        const tempDir = os.tmpdir()
        const tempFilePath = path.join(tempDir, `${Date.now()}-${batch.fileName}`)
        
        await fs.promises.writeFile(tempFilePath, batch.content, 'utf-8')
        
        await assistant.uploadFile({
          path: tempFilePath,
          metadata: {
            userId,
            folderId,
            batchFileName: batch.fileName,
            includedFiles: JSON.stringify(batch.fileNames),
            fileCount: batch.fileNames.length.toString(),
            uploadedAt: new Date().toISOString(),
          }
        })
        
        // Clean up temp file
        try {
          await fs.promises.unlink(tempFilePath)
        } catch (unlinkError) {
          console.warn(`Could not delete temp file ${tempFilePath}:`, unlinkError)
        }
        
        console.log(`Batch ${batch.fileName} uploaded with ${batch.fileNames.length} files`)
        uploadResults.push({
          batchName: batch.fileName,
          files: batch.fileNames,
          status: 'success'
        })
      } catch (error) {
        console.error(`Error uploading batch ${batch.fileName}:`, error)
        uploadResults.push({
          batchName: batch.fileName,
          files: batch.fileNames,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return uploadResults
  }
}