import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
});

export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  try {
    const cleanedText = text.slice(0, 8000);
    
    const response = await openai.embeddings.create({
      model: 'openai/text-embedding-3-small',
      input: cleanedText,
    });
    
    return {
      embedding: response.data[0].embedding,
      tokenCount: response.usage?.total_tokens || 0,
    };
  } catch (error) {
    console.error('Embedding generation error:', error);
    throw new Error('임베딩 생성에 실패했습니다.');
  }
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  
  const batchSize = 20;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const cleanedBatch = batch.map(t => t.slice(0, 8000));
    
    try {
      const response = await openai.embeddings.create({
        model: 'openai/text-embedding-3-small',
        input: cleanedBatch,
      });
      
      for (const item of response.data) {
        results.push({
          embedding: item.embedding,
          tokenCount: 0,
        });
      }
    } catch (error) {
      console.error('Batch embedding error:', error);
      for (const text of batch) {
        try {
          const single = await generateEmbedding(text);
          results.push(single);
        } catch {
          results.push({ embedding: [], tokenCount: 0 });
        }
      }
    }
    
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function rankByRelevance<T extends { embedding?: string | number[] }>(
  items: T[],
  queryEmbedding: number[],
  topK: number = 5
): (T & { score: number })[] {
  const scored = items.map(item => {
    let embedding: number[] = [];
    if (typeof item.embedding === 'string') {
      try {
        embedding = JSON.parse(item.embedding);
      } catch {
        embedding = [];
      }
    } else if (Array.isArray(item.embedding)) {
      embedding = item.embedding;
    }
    
    const score = cosineSimilarity(queryEmbedding, embedding);
    return { ...item, score };
  });
  
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
