import { getPineconeIndex } from './pinecone'
import { generateEmbeddings } from './openai'
import { TextChunk } from './text-chunker'
import { PineconeRecord } from '@pinecone-database/pinecone'

export interface ChunkMetadata extends Record<string, any> {
  fileId: string
  fileName: string
  folderId: string
  folderName: string
  chunkIndex: number
  chunkText: string
  mimeType: string
  startIndex: number
  endIndex: number
  userId: string
}

export interface SearchResult {
  id: string
  score: number
  metadata: ChunkMetadata
}

export class VectorStore {
  private index = getPineconeIndex()

  async indexFileChunks(
    fileId: string,
    fileName: string,
    folderId: string,
    folderName: string,
    userId: string,
    mimeType: string,
    chunks: TextChunk[]
  ): Promise<void> {
    if (chunks.length === 0) {
      return
    }

    try {
      // Generate embeddings for all chunks
      const texts = chunks.map(chunk => chunk.content)
      const embeddings = await generateEmbeddings(texts)

      // Prepare records for Pinecone
      const records: PineconeRecord[] = chunks.map((chunk, index) => ({
        id: `${fileId}-chunk-${chunk.chunkIndex}`,
        values: embeddings[index],
        metadata: {
          fileId,
          fileName,
          folderId,
          folderName,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.content,
          mimeType,
          startIndex: chunk.startIndex,
          endIndex: chunk.endIndex,
          userId,
        } as ChunkMetadata,
      }))

      // Upsert to Pinecone with user namespace
      await this.index.namespace(userId).upsert(records)

      console.log(`Indexed ${chunks.length} chunks for file ${fileName}`)
    } catch (error) {
      console.error(`Error indexing file ${fileName}:`, error)
      throw error
    }
  }

  async searchSimilar(
    query: string,
    userId: string,
    options: {
      folderId?: string
      topK?: number
      minScore?: number
    } = {}
  ): Promise<SearchResult[]> {
    try {
      const { folderId, topK = 10, minScore = 0.7 } = options

      // Generate embedding for the query
      const [queryEmbedding] = await generateEmbeddings([query])

      // Build filter for folder if specified
      const filter: Record<string, any> = {}
      if (folderId) {
        filter.folderId = { $eq: folderId }
      }

      // Search in user namespace
      const searchResponse = await this.index.namespace(userId).query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      })

      // Filter by minimum score and format results
      const results: SearchResult[] = searchResponse.matches
        ?.filter(match => (match.score ?? 0) >= minScore)
        .map(match => ({
          id: match.id,
          score: match.score ?? 0,
          metadata: match.metadata as unknown as ChunkMetadata,
        })) ?? []

      return results
    } catch (error) {
      console.error('Error searching vectors:', error)
      throw error
    }
  }

  async deleteFileVectors(fileId: string, userId: string): Promise<void> {
    try {
      // Delete all chunks for this file
      await this.index.namespace(userId).deleteMany({
        fileId: { $eq: fileId }
      })
      
      console.log(`Deleted vectors for file ${fileId}`)
    } catch (error) {
      console.error(`Error deleting vectors for file ${fileId}:`, error)
      throw error
    }
  }

  async deleteFolderVectors(folderId: string, userId: string): Promise<void> {
    try {
      // Delete all chunks for this folder
      await this.index.namespace(userId).deleteMany({
        folderId: { $eq: folderId }
      })
      
      console.log(`Deleted vectors for folder ${folderId}`)
    } catch (error) {
      console.error(`Error deleting vectors for folder ${folderId}:`, error)
      throw error
    }
  }

  async deleteUserVectors(userId: string): Promise<void> {
    try {
      // Delete entire user namespace
      await this.index.namespace(userId).deleteAll()
      
      console.log(`Deleted all vectors for user ${userId}`)
    } catch (error) {
      console.error(`Error deleting vectors for user ${userId}:`, error)
      throw error
    }
  }

  async getFileChunkCount(fileId: string, userId: string): Promise<number> {
    try {
      const stats = await this.index.namespace(userId).describeIndexStats()
      // Note: This is an approximation since Pinecone doesn't provide exact counts by filter
      // In practice, you might want to track this in your database
      return 0 // Placeholder - actual implementation would need database tracking
    } catch (error) {
      console.error(`Error getting chunk count for file ${fileId}:`, error)
      return 0
    }
  }
}