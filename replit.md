# SQL Chatbot - Data Copilot

## Overview

A Korean-language SQL chatbot application that allows users to query a PostgreSQL database using natural language. The system uses AI (via OpenRouter) to convert natural language questions into SQL queries, executes them against a sample business database (products and sales), and returns formatted results with the generated SQL.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state, React useState for local state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Animations**: Framer Motion for smooth UI transitions
- **Build Tool**: Vite with hot module replacement

The frontend is organized as a single-page application with a chat interface as the primary interaction point. Components are split between custom feature components (`ChatInput`, `SqlBlock`, `DataTable`) and reusable UI primitives from shadcn/ui.

Key UI Components:
- **Sidebar** (`client/src/components/Sidebar.tsx`): Conversation history, new chat button, file upload, dark/light theme toggle
- **TopNav** (`client/src/components/TopNav.tsx`): Tab navigation (채팅, 데이터베이스, 지식베이스, 설정)
- **SettingsPage** (`client/src/components/SettingsPage.tsx`): Model configuration (temperature, RAG toggle)
- **DatabasePage** (`client/src/components/DatabasePage.tsx`): Database table metadata display
- **KnowledgeBasePage** (`client/src/components/KnowledgeBasePage.tsx`): Document upload and management for RAG

Features:
- Conversation persistence via localStorage (max 20 conversations, 80 messages each)
- Dark/light mode with localStorage persistence
- Sample query buttons for quick testing
- **Data Visualization**: Interactive charts for query results
  - Bar, Line, and Pie chart types via Recharts
  - Auto-detection of chartable data (requires numeric columns)
  - Toggle button to show/hide charts
  - Responsive design with Korean number formatting (K, M, B)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for TypeScript execution
- **API Pattern**: REST endpoints under `/api/*` prefix
- **Build Process**: esbuild for production bundling with selective dependency bundling for faster cold starts

The server handles API requests, serves the static frontend in production, and manages database connections. Development uses Vite middleware for HMR.

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit with `db:push` command for schema synchronization
- **Tables**: 
  - `users` - Basic user authentication
  - `products` - Sample product catalog
  - `sales` - Sample sales records
  - `conversations` / `messages` - Chat history persistence
  - `datasets` - Uploaded CSV dataset metadata
  - `structured_data` - Structured (tabular) data storage with JSON columns
  - `unstructured_data` - Unstructured (text) data with search support

### CSV Upload & Dataset Management (v2.0)
- **File Upload**: Multer for multipart/form-data handling, max 10MB
- **CSV Parsing**: PapaParse for parsing CSV files with header support
- **Data Storage**:
  - **Structured Data (DuckDB)**: High-performance columnar database for analytics (970x faster than MySQL)
    - Stored in `data/analytics.duckdb` file
    - Auto-type inference for columns (VARCHAR, DOUBLE, TIMESTAMP, BOOLEAN)
    - Managed via `server/duckdb-service.ts`
  - **Unstructured Data (PostgreSQL)**: Text storage with full-text search support
    - Stored in `unstructured_data` table
    - Prepared for pgvector integration (semantic search)
- **New Upload UI**: Redesigned dialog based on modern data platform patterns
  - Dataset name input
  - CSV file selection only
  - Privacy anonymization toggle (optional)
  - Data type dropdown with database info
- **Features**:
  - Automatic column type inference from data
  - Dataset viewing with pagination (queries from DuckDB or PostgreSQL)
  - Dataset deletion with DuckDB table cleanup
  - Dynamic AI schema includes uploaded datasets
  - **Auto-generated sample questions**: Based on uploaded dataset columns and types
    - API endpoint: `/api/sample-questions`
    - Generates context-aware questions (count, aggregate, group by, filter)
    - Displays in chat interface with dataset-specific styling
  - Full Korean filename and column name support (Unicode ranges \uAC00-\uD7A3)

### AI Integration
- **Dual Mode Execution**: Cloud (OpenRouter) OR Local (Ollama)
- **Provider Options**:
  - **OpenRouter API**: Cloud-based via OpenAI-compatible interface
  - **Ollama** (`server/ollama-service.ts`): Local AI model execution
- **Default Model**: mistralai/devstral-2512:free (cloud) or llama3.2:3b (local)
- **Purpose**: Natural language to SQL translation and RAG responses
- **Features**:
  - Enhanced schema metadata with column types and descriptions
  - 16 few-shot examples for improved SQL accuracy
  - SQL error auto-retry with LLM-based fix (max 2 retries)
  - Dynamic schema includes user-uploaded datasets
- **Rate Limiting**: Batch processing utilities with exponential backoff retry logic

### Ollama Local AI (v4.0)
- **Service Module** (`server/ollama-service.ts`):
  - HTTP API communication with Ollama server
  - Connection status checking (auto-refresh every 10 seconds)
  - Model listing from local Ollama installation
  - Text generation via `/api/generate` endpoint
- **Recommended Models for 8GB RAM**:
  - llama3.2:3b (2GB) - Primary recommendation
  - gemma2:2b (1.5GB) - Lightweight option
  - phi3:mini (2.3GB) - Good balance
  - qwen2:1.5b (1GB) - Minimal footprint
- **Configuration**:
  - baseUrl: http://localhost:11434 (default)
  - Toggle between Ollama (local) and OpenRouter (cloud)
  - localStorage persistence for settings
- **API Endpoints**:
  - `GET /api/ollama/config` - Current configuration
  - `PUT /api/ollama/config` - Update settings
  - `GET /api/ollama/status` - Connection status
  - `GET /api/ollama/models` - Installed models list
  - `GET /api/ollama/recommended-models` - Models for low-spec systems
- **Setup**: User must install Ollama separately (`curl -fsSL https://ollama.com/install.sh | sh`)

### Knowledge Base & RAG System (v3.1)
- **Document Parsing** (`server/document-parser.ts`):
  - PDF parsing with pdf-parse library (dynamic import for CommonJS compatibility)
  - DOC/DOCX extraction with mammoth
  - PPT/PPTX extraction with officeparser
  - OCR support for image-based PDFs using Tesseract.js (Korean + English)
  - Automatic OCR fallback when PDF text extraction fails
- **Search Service** (`server/embedding-service.ts`):
  - Text chunking: 500 tokens with 50-token overlap for context preservation
  - **Keyword-based search** (OpenRouter doesn't support embeddings API)
  - Tokenization with Korean character support (한글 유니코드 범위)
  - Exact and partial keyword matching with scoring
- **RAG Service** (`server/rag-service.ts`):
  - Keyword-based similarity search across document chunks
  - Retrieves top 5 most relevant chunks per query
  - Source attribution with document name, page number, and relevance score
  - **Multi-model fallback for stability** (로컬 기반, 온라인 모델 제외):
    1. Meta Llama 3.3 70B (primary, multilingual)
    2. Mistral Devstral (backup)
  - Intent detection for summary/excerpt/content queries
- **Model Management** (설정 페이지):
  - 모델 목록 표시 (활성/비활성 상태)
  - 모델 활성화/비활성화 토글
  - 새 모델 추가 기능 (OpenRouter 형식)
  - 모델 삭제 기능
  - localStorage 영구 저장 (페이지 새로고침 후에도 유지)
  - 서버와 자동 동기화
- **Database Tables**:
  - `knowledge_documents` - Document metadata (name, type, status, chunk count)
  - `document_chunks` - Vectorized text chunks with pgvector embeddings
- **API Endpoints**:
  - `POST /api/knowledge-base/upload` - Multi-file upload (10MB per file, 500MB total)
  - `GET /api/knowledge-base/documents` - List all documents with status
  - `DELETE /api/knowledge-base/documents/:id` - Delete document and chunks
  - `GET /api/knowledge-base/stats` - Document statistics
  - `POST /api/rag/query` - RAG query with source retrieval
- **Frontend Integration**:
  - "RAG 사용" toggle in Settings page switches between SQL and RAG modes
  - Chat displays sources with relevance scores and page numbers
  - Knowledge Base page shows upload progress and document status

### Key Design Decisions

1. **Shared Schema Pattern**: Database schema defined in `shared/` directory allows type safety across frontend and backend, with Drizzle-Zod integration for runtime validation.

2. **Monorepo Structure**: Single repository with `client/`, `server/`, and `shared/` directories. Path aliases (`@/`, `@shared/`) configured in both TypeScript and Vite.

3. **Production Build**: Custom build script bundles server with esbuild while allowing Vite to handle the frontend. Selective dependency bundling reduces cold start times.

4. **Replit Integrations**: Custom integration modules in `server/replit_integrations/` for chat routes and batch processing utilities.

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Services
- **OpenRouter API**: AI model access via OpenAI-compatible SDK
  - `AI_INTEGRATIONS_OPENROUTER_BASE_URL`: API base URL
  - `AI_INTEGRATIONS_OPENROUTER_API_KEY`: Authentication key

### UI Libraries
- **Radix UI**: Accessible primitives for shadcn/ui components
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **Recharts**: Charting library (via shadcn/ui chart component)

### Development Tools
- **Vite**: Frontend build and dev server
- **tsx**: TypeScript execution for Node.js
- **Drizzle Kit**: Database migration tooling