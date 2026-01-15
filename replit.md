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
- **TopNav** (`client/src/components/TopNav.tsx`): Tab navigation (채팅, 데이터베이스, 설정)
- **SettingsPage** (`client/src/components/SettingsPage.tsx`): Model configuration (temperature, RAG toggle)
- **DatabasePage** (`client/src/components/DatabasePage.tsx`): Database table metadata display

Features:
- Conversation persistence via localStorage (max 20 conversations, 80 messages each)
- Dark/light mode with localStorage persistence
- Sample query buttons for quick testing

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

### AI Integration
- **Provider**: OpenRouter API (OpenAI-compatible interface)
- **Model**: Mistral 7B Instruct (free tier, optimized for low-spec systems)
- **Purpose**: Natural language to SQL translation
- **Rate Limiting**: Batch processing utilities with exponential backoff retry logic

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