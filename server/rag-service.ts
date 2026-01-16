import { db } from './db';
import { knowledgeDocuments, documentChunks, KnowledgeDocument, DocumentChunk } from '@shared/schema';
import { eq, ilike, sql, desc } from 'drizzle-orm';
import { generateEmbedding, cosineSimilarity } from './embedding-service';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
});

export interface SearchResult {
  chunkId: number;
  documentId: number;
  documentName: string;
  content: string;
  pageNumber?: number;
  score: number;
}

export interface RagContext {
  results: SearchResult[];
  totalFound: number;
}

export async function hybridSearch(
  query: string,
  topK: number = 5
): Promise<RagContext> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    
    const allChunks = await db
      .select({
        id: documentChunks.id,
        documentId: documentChunks.documentId,
        content: documentChunks.content,
        pageNumber: documentChunks.pageNumber,
        embedding: documentChunks.embedding,
        documentName: knowledgeDocuments.name,
      })
      .from(documentChunks)
      .innerJoin(knowledgeDocuments, eq(documentChunks.documentId, knowledgeDocuments.id))
      .where(eq(knowledgeDocuments.status, 'ready'));
    
    const scoredChunks = allChunks.map(chunk => {
      let vectorScore = 0;
      if (chunk.embedding) {
        try {
          const embedding = JSON.parse(chunk.embedding);
          vectorScore = cosineSimilarity(queryEmbedding.embedding, embedding);
        } catch {
          vectorScore = 0;
        }
      }
      
      const queryTerms = query.toLowerCase().split(/\s+/);
      const contentLower = chunk.content.toLowerCase();
      let keywordScore = 0;
      for (const term of queryTerms) {
        if (term.length >= 2 && contentLower.includes(term)) {
          keywordScore += 0.1;
        }
      }
      keywordScore = Math.min(keywordScore, 0.3);
      
      const combinedScore = vectorScore * 0.7 + keywordScore * 0.3;
      
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId!,
        documentName: chunk.documentName,
        content: chunk.content,
        pageNumber: chunk.pageNumber || undefined,
        score: combinedScore,
      };
    });
    
    const results = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(r => r.score > 0.1);
    
    return {
      results,
      totalFound: results.length,
    };
  } catch (error) {
    console.error('Hybrid search error:', error);
    return { results: [], totalFound: 0 };
  }
}

export async function generateRagResponse(
  query: string,
  context: SearchResult[]
): Promise<string> {
  if (context.length === 0) {
    return '관련 문서를 찾을 수 없습니다. 지식베이스에 문서를 먼저 등록해주세요.';
  }
  
  const contextText = context
    .map((r, i) => {
      const pageInfo = r.pageNumber ? ` (${r.pageNumber}페이지)` : '';
      return `[출처 ${i + 1}: ${r.documentName}${pageInfo}]\n${r.content}`;
    })
    .join('\n\n---\n\n');
  
  const systemPrompt = `당신은 한국어로 답변하는 AI 어시스턴트입니다.
주어진 문서 컨텍스트를 기반으로 사용자의 질문에 정확하게 답변해야 합니다.

중요 규칙:
1. 반드시 제공된 컨텍스트 내용만 사용하여 답변하세요
2. 컨텍스트에 없는 내용은 추측하지 마세요
3. 답변의 근거가 되는 출처를 명시하세요
4. 답변을 찾을 수 없으면 솔직하게 말하세요
5. 간결하고 명확하게 답변하세요`;

  const userPrompt = `질문: ${query}

관련 문서 컨텍스트:
${contextText}

위 컨텍스트를 바탕으로 질문에 답변해주세요.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'mistralai/devstral-2512:free',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });
    
    return response.choices[0]?.message?.content || '응답을 생성할 수 없습니다.';
  } catch (error) {
    console.error('RAG response generation error:', error);
    return '응답 생성 중 오류가 발생했습니다.';
  }
}

export async function queryRag(query: string): Promise<{
  answer: string;
  sources: SearchResult[];
}> {
  const searchContext = await hybridSearch(query, 5);
  const answer = await generateRagResponse(query, searchContext.results);
  
  return {
    answer,
    sources: searchContext.results,
  };
}

export async function getDocumentStats(): Promise<{
  totalDocuments: number;
  totalChunks: number;
  documentsByStatus: Record<string, number>;
}> {
  const docs = await db.select().from(knowledgeDocuments);
  
  const statusCounts: Record<string, number> = {};
  for (const doc of docs) {
    statusCounts[doc.status] = (statusCounts[doc.status] || 0) + 1;
  }
  
  const chunks = await db.select().from(documentChunks);
  
  return {
    totalDocuments: docs.length,
    totalChunks: chunks.length,
    documentsByStatus: statusCounts,
  };
}
