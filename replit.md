# PST Email Search Application

## Overview

This is a PST (Personal Storage Table) email search and management application with AI-powered features. It allows users to import email data from PST or JSON files, search through emails with relevance scoring, and use an AI assistant for chat and calendar event extraction. The application is built as a full-stack TypeScript project with a React frontend and Express backend, designed for productivity-focused email data exploration.

## User Preferences

Preferred communication style: Simple, everyday language.
LLM Provider: Local Ollama server (default: http://localhost:11434)

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing (4 pages: Home, Chat, Calendar, Settings)
- **State Management**: TanStack React Query for server state and data fetching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming (supports light/dark modes)
- **Design System**: Material Design 3 principles adapted for utility-focused productivity tools
- **Build Tool**: Vite with HMR support
- **Navigation**: Bottom navigation bar (mobile) / Side navigation (desktop)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: RESTful endpoints under `/api` prefix
- **File Handling**: Multer for processing file uploads (up to 100MB), PST parsing via pst-extractor
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **LLM Integration**: Ollama client for local Llama model (server/ollama.ts)
- **PST Parsing**: pst-extractor library for Outlook PST file support (server/pst-parser.ts)
- **Development**: tsx for TypeScript execution, Vite dev server integration

### Data Layer
- **Database**: PostgreSQL (default) or SQLite (local storage mode)
- **Schema Definition**: Drizzle schema in `shared/schema.ts`
- **Tables**:
  - `emails`: Stores imported email data (subject, sender, date, body, importance, label, classification)
  - `importLogs`: Tracks file import history with email counts
  - `users`: User management (id, username, password)
  - `conversations`: AI chat conversations
  - `messages`: Chat messages (user/assistant roles)
  - `calendarEvents`: Extracted calendar events from emails
  - `appSettings`: Application configuration storage
  - `ragChunks`: Vector embeddings for RAG (emailId, chunkIndex, content, embedding)
- **Validation**: Zod schemas generated from Drizzle for type-safe API contracts
- **Storage Modes**:
  - PostgreSQL (default): Cloud database via DATABASE_URL
  - Local SQLite: Set STORAGE_MODE=local and DATA_DIR=/path/to/folder

### Search Implementation
- Token-based text search with scoring algorithm
- Searches across subject, sender, and body fields
- Returns results ordered by relevance score

### AI Features
- **AI Chat (Vector RAG)**: Chat with local Llama model via Ollama, uses vector embeddings for semantic search with automatic fallback to keyword search
- **Vector Embeddings**: nomic-embed-text model generates embeddings for all imported emails (OLLAMA_EMBED_MODEL env var configurable)
- **Semantic Search**: Cosine similarity-based search across email chunks for more accurate context retrieval
- **Email Classification**: Automatic categorization into task, meeting, approval, notice
- **Calendar Event Extraction**: AI-powered extraction of dates, times, and event details from emails (auto-triggered on import)
- **Environment**: OLLAMA_BASE_URL (default: http://localhost:11434), OLLAMA_EMBED_MODEL (default: nomic-embed-text)

### Auto-Processing on Import
When emails are imported (PST or JSON), the system automatically:
1. Parses and stores email data
2. Classifies each email into categories (if Ollama connected)
3. Extracts calendar events from email content (if Ollama connected)
4. Generates vector embeddings for RAG using nomic-embed-text (if Ollama connected)
5. Updates the calendar view with extracted events

### Build Process
- Frontend: Vite builds to `dist/public`
- Backend: esbuild bundles server to `dist/index.cjs`
- Selective dependency bundling for optimized cold start times

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connected via `DATABASE_URL` environment variable
- **Connection**: Uses `pg` Pool for connection management

### UI Component Libraries
- **Radix UI**: Complete primitive set for accessible components (dialogs, dropdowns, tabs, etc.)
- **shadcn/ui**: Pre-styled component collection using Radix primitives
- **Lucide React**: Icon library

### Data & Forms
- **TanStack React Query**: Async state management and caching
- **React Hook Form**: Form state management
- **Zod**: Schema validation

### Styling
- **Tailwind CSS**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **Google Fonts**: Inter (primary), JetBrains Mono (monospace)

### Development Tools
- **Vite**: Build tool and dev server
- **Replit plugins**: Error overlay, cartographer, dev banner (development only)