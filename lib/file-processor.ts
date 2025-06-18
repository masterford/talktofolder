import { google } from 'googleapis'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export interface ProcessedFile {
  content: string
  metadata: {
    fileName: string
    mimeType: string
    size: number
    pageCount?: number
  }
}

export class FileProcessor {
  private drive: any

  constructor(oauth2Client: any) {
    this.drive = google.drive({ version: 'v3', auth: oauth2Client })
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const response = await this.drive.files.get({
      fileId,
      alt: 'media',
    }, { responseType: 'arraybuffer' })
    
    return Buffer.from(response.data)
  }

  async downloadGoogleDoc(fileId: string, mimeType: string): Promise<Buffer> {
    // Export Google Workspace files to supported formats
    let exportMimeType: string
    
    switch (mimeType) {
      case 'application/vnd.google-apps.document':
        exportMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        break
      case 'application/vnd.google-apps.spreadsheet':
        exportMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        break
      default:
        throw new Error(`Unsupported Google Workspace file type: ${mimeType}`)
    }

    const response = await this.drive.files.export({
      fileId,
      mimeType: exportMimeType,
    }, { responseType: 'arraybuffer' })
    
    return Buffer.from(response.data)
  }

  async processFile(fileId: string, fileName: string, mimeType: string): Promise<ProcessedFile> {
    try {
      let buffer: Buffer
      let content: string
      let pageCount: number | undefined

      // Download file based on type
      if (mimeType.startsWith('application/vnd.google-apps.')) {
        buffer = await this.downloadGoogleDoc(fileId, mimeType)
      } else {
        buffer = await this.downloadFile(fileId)
      }

      // Parse content based on MIME type
      switch (true) {
        case mimeType === 'application/pdf':
          // Dynamic import to avoid compilation issues
          const pdf = (await import('pdf-parse')).default
          const pdfData = await pdf(buffer)
          content = pdfData.text
          pageCount = pdfData.numpages
          break

        case mimeType.includes('document') || mimeType.includes('word'):
          const docResult = await mammoth.extractRawText({ buffer })
          content = docResult.value
          break

        case mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv':
          const workbook = XLSX.read(buffer, { type: 'buffer' })
          content = this.extractTextFromWorkbook(workbook)
          break

        default:
          throw new Error(`Unsupported file type: ${mimeType}`)
      }

      // Clean and normalize content
      content = this.cleanText(content)

      return {
        content,
        metadata: {
          fileName,
          mimeType,
          size: buffer.length,
          pageCount,
        }
      }
    } catch (error) {
      console.error(`Error processing file ${fileName}:`, error)
      throw error
    }
  }

  private extractTextFromWorkbook(workbook: XLSX.WorkBook): string {
    const sheets: string[] = []
    
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName]
      const sheetText = XLSX.utils.sheet_to_txt(sheet)
      if (sheetText.trim()) {
        sheets.push(`--- Sheet: ${sheetName} ---\n${sheetText}`)
      }
    })
    
    return sheets.join('\n\n')
  }

  private cleanText(text: string): string {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
      .replace(/\t+/g, ' ') // Replace tabs with spaces
      .replace(/[ ]{2,}/g, ' ') // Collapse multiple spaces
      .trim()
  }
}