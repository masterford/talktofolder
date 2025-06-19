# TalkToFolder

TalkToFolder allows you to connect your Google Drive folders and chat with an AI assistant about the contents of your files. Simply authenticate with Google, select or add a folder, and start asking questions about your documents. You can also view contents of individual files inside of an iframe next to the chat panel.

# Demo
Try a live demo here: https://talktofolder-masterfords-projects.vercel.app/
Note: The demo is using a free Pinecone account, so it has some limitations. You can try it out, but might take a few seconds longer for the assistant to index your documents. Do not chat with any sensitive folders as the demo is tied to my Pinecone account, run it locally for full security isolation.

## Features

- 🔐 **Google OAuth Integration** - Secure authentication with Google Drive
- 📁 **Folder Management** - Browse and select folders from your Google Drive or add via URL
- 🤖 **AI-Powered Chat** - Ask questions about your documents and get intelligent responses
- 📄 **Multi-Format Support** - Works with PDFs, Google Docs, Sheets, Word documents, and CSV files
- 🔄 **Automatic Indexing** - Files are automatically processed when you add a folder
- 🗑️ **Chat Management** - Delete chats to clean up history and re-index folders
- 📱 **Responsive UI** - Clean, modern interface with resizable panels

## Technical Architecture

### Pinecone Assistant Integration

This project uses **Pinecone Assistant** for document storage and retrieval. Due to limitations on the free Pinecone plan (10 documents per assistant), we implement a batching strategy:

- Multiple files are combined into larger documents (up to 10MB each)
- Each file's content is prefixed with a clear header: `=== FILE: filename ===`
- When re-indexing, old documents are deleted first to prevent duplicates

**Note for Developers**: The codebase also includes support for regular Pinecone indexes (see `/api/chat` and `/api/folders/[id]/index`). You can easily swap between Pinecone Assistant and regular Pinecone by using the appropriate endpoints.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Google Cloud Console project with Drive API enabled
- Pinecone account
- OpenAI API key

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Pinecone
PINECONE_API_KEY="your-pinecone-api-key"
PINECONE_ENVIRONMENT="your-environment"
PINECONE_INDEX_NAME="your-index-name"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"
```

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   ```bash
   npx prisma migrate dev
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

### Google Drive Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable the Google Drive API
3. Create OAuth 2.0 credentials
4. Add `http://localhost:3000/api/auth/callback/google` to authorized redirect URIs
5. Add required scopes: `drive.readonly`, `userinfo.email`, `userinfo.profile`

## Usage

1. Sign in with your Google account
2. Grant access to your Google Drive
3. Add a folder by URL or browse your Drive folders
4. Wait for automatic indexing to complete
5. Start chatting about your documents!

## License

MIT