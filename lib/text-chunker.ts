export interface TextChunk {
  content: string
  startIndex: number
  endIndex: number
  chunkIndex: number
}

export interface ChunkingOptions {
  chunkSize: number // Target chunk size in characters
  chunkOverlap: number // Overlap between chunks in characters
  separators: string[] // Separators to split on, in order of preference
}

export class TextChunker {
  private options: ChunkingOptions

  constructor(options: Partial<ChunkingOptions> = {}) {
    this.options = {
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ': ', ', ', ' '],
      ...options
    }
  }

  chunkText(text: string): TextChunk[] {
    if (!text || text.trim().length === 0) {
      return []
    }

    const chunks: TextChunk[] = []
    let startIndex = 0
    let chunkIndex = 0

    while (startIndex < text.length) {
      const endIndex = Math.min(startIndex + this.options.chunkSize, text.length)
      
      // If we're not at the end, try to find a good break point
      let actualEndIndex = endIndex
      if (endIndex < text.length) {
        actualEndIndex = this.findBestBreakPoint(text, startIndex, endIndex)
      }

      const chunkContent = text.slice(startIndex, actualEndIndex).trim()
      
      if (chunkContent.length > 0) {
        chunks.push({
          content: chunkContent,
          startIndex,
          endIndex: actualEndIndex,
          chunkIndex: chunkIndex++
        })
      }

      // Move to next chunk with overlap
      startIndex = Math.max(
        actualEndIndex - this.options.chunkOverlap,
        startIndex + 1 // Ensure we always make progress
      )
    }

    return chunks
  }

  private findBestBreakPoint(text: string, startIndex: number, endIndex: number): number {
    // Look for the best separator within a reasonable range before the end
    const searchStart = Math.max(startIndex, endIndex - 200) // Look back up to 200 chars
    const searchText = text.slice(searchStart, endIndex)

    for (const separator of this.options.separators) {
      const separatorIndex = searchText.lastIndexOf(separator)
      if (separatorIndex !== -1) {
        return searchStart + separatorIndex + separator.length
      }
    }

    // If no good separator found, just cut at the end
    return endIndex
  }

  // Utility method to estimate token count (rough approximation)
  estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4)
  }

  // Create chunks targeting a specific token count
  chunkByTokens(text: string, targetTokens: number = 250, overlapTokens: number = 50): TextChunk[] {
    const targetChars = targetTokens * 4
    const overlapChars = overlapTokens * 4

    const chunker = new TextChunker({
      chunkSize: targetChars,
      chunkOverlap: overlapChars,
      separators: this.options.separators
    })

    return chunker.chunkText(text)
  }
}