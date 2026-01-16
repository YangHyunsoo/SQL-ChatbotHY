import { db } from './db';
import { knowledgeDocuments, documentChunks, KnowledgeDocument, DocumentChunk } from '@shared/schema';
import { eq, ilike, sql, desc } from 'drizzle-orm';
import { generateEmbedding, keywordSimilarity } from './embedding-service';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
});

// 한국어 문서 요약 모델 - 우선순위별 폴백
const RAG_MODELS = [
  "google/gemini-2.0-flash-exp:free",       // Google Gemini - 안정적, 다국어 지원
  "meta-llama/llama-3.3-70b-instruct:free", // Llama 3.3 - 대용량, 다국어
  "mistralai/devstral-2512:free",           // Mistral Devstral - 백업
];

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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2);
}

export async function hybridSearch(
  query: string,
  topK: number = 5
): Promise<RagContext> {
  try {
    const queryTokens = tokenize(query);
    console.log('RAG Search - Query tokens:', queryTokens);
    
    const allChunks = await db
      .select({
        id: documentChunks.id,
        documentId: documentChunks.documentId,
        content: documentChunks.content,
        pageNumber: documentChunks.pageNumber,
        documentName: knowledgeDocuments.name,
      })
      .from(documentChunks)
      .innerJoin(knowledgeDocuments, eq(documentChunks.documentId, knowledgeDocuments.id))
      .where(eq(knowledgeDocuments.status, 'ready'));
    
    console.log('RAG Search - Found chunks:', allChunks.length);
    
    if (allChunks.length === 0) {
      console.log('RAG Search - No chunks found in ready documents');
      return { results: [], totalFound: 0 };
    }
    
    const scoredChunks = allChunks.map(chunk => {
      const contentTokens = tokenize(chunk.content);
      
      let matchScore = 0;
      for (const queryToken of queryTokens) {
        for (const contentToken of contentTokens) {
          if (contentToken === queryToken) {
            matchScore += 1.0;
          } else if (contentToken.includes(queryToken) || queryToken.includes(contentToken)) {
            matchScore += 0.5;
          }
        }
      }
      
      const normalizedScore = Math.min(matchScore / Math.max(queryTokens.length, 1), 1.0);
      
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId!,
        documentName: chunk.documentName,
        content: chunk.content,
        pageNumber: chunk.pageNumber || undefined,
        score: normalizedScore,
      };
    });
    
    console.log('RAG Search - Top scores:', scoredChunks.slice(0, 3).map(c => ({ id: c.chunkId, score: c.score })));
    
    const results = scoredChunks
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    
    if (results.length > 0 && results[0].score === 0) {
      console.log('RAG Search - No keyword matches, returning top chunks anyway');
    }
    
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
  
  const isSummaryRequest = /요약|정리|간략|핵심|개요/.test(query);
  const isExcerptRequest = /발췌|인용|원문|그대로/.test(query);
  const isContentRequest = /내용|뭐야|무엇|무슨|어떤/.test(query);
  
  let taskInstruction = '';
  if (isSummaryRequest) {
    taskInstruction = '문서 내용을 체계적으로 요약하여 핵심 포인트를 정리해주세요.';
  } else if (isExcerptRequest) {
    taskInstruction = '관련 내용을 원문에서 그대로 발췌하여 인용 형태로 보여주세요.';
  } else if (isContentRequest) {
    taskInstruction = '문서의 해당 내용을 상세하게 설명해주세요.';
  } else {
    taskInstruction = '질문에 대해 정확하고 상세하게 답변해주세요.';
  }
  
  const systemPrompt = `당신은 문서 분석 전문 AI 어시스턴트입니다. 한국어로 답변합니다.
사용자가 지식베이스에 등록한 문서를 기반으로 질문에 답변해야 합니다.

## 역할
- 문서 내용 분석 및 요약
- 특정 정보 검색 및 추출
- 문서 간 관련 정보 연결
- 원문 발췌 및 인용

## 답변 규칙
1. 제공된 문서 컨텍스트만 사용하여 답변하세요
2. 답변 시 출처(문서명, 페이지)를 명시하세요
3. 문서에 없는 내용은 "해당 내용은 등록된 문서에서 찾을 수 없습니다"라고 솔직하게 말하세요
4. 요약 요청 시 핵심 포인트를 불릿 포인트로 정리하세요
5. 발췌 요청 시 원문을 인용부호와 함께 제시하세요
6. 전문 용어는 한국어 설명을 추가하세요`;

  const userPrompt = `## 질문
${query}

## 작업
${taskInstruction}

## 참조 문서
${contextText}

위 문서 내용을 바탕으로 답변해주세요.`;

  // 여러 모델 폴백으로 안정성 향상
  for (const model of RAG_MODELS) {
    try {
      console.log(`RAG using model: ${model}`);
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });
      
      const content = response.choices[0]?.message?.content;
      if (content) {
        return content;
      }
    } catch (error: any) {
      console.error(`RAG model ${model} error:`, error.message || error);
      // 다음 모델로 폴백
      continue;
    }
  }
  
  return '응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
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
