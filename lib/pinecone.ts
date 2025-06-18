import { Pinecone } from '@pinecone-database/pinecone'

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY environment variable is required')
}

export const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
})

export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'talktofolder'
export const EMBEDDING_DIMENSION = 1536 // OpenAI text-embedding-3-small dimension

// Initialize index (call this once during setup)
export async function initializePineconeIndex() {
  try {
    const existingIndexes = await pinecone.listIndexes()
    const indexExists = existingIndexes.indexes?.some(index => index.name === PINECONE_INDEX_NAME)
    
    if (!indexExists) {
      await pinecone.createIndex({
        name: PINECONE_INDEX_NAME,
        dimension: EMBEDDING_DIMENSION,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      })
      
      // Wait for index to be ready
      let isReady = false
      while (!isReady) {
        const description = await pinecone.describeIndex(PINECONE_INDEX_NAME)
        isReady = description.status?.ready === true
        if (!isReady) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }
    
    return pinecone.index(PINECONE_INDEX_NAME)
  } catch (error) {
    console.error('Error initializing Pinecone index:', error)
    throw error
  }
}

export function getPineconeIndex() {
  return pinecone.index(PINECONE_INDEX_NAME)
}