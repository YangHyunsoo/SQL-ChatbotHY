interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message: OllamaChatMessage;
  done: boolean;
}

let ollamaBaseUrl = 'http://localhost:11434';
let ollamaEnabled = false;

export function setOllamaConfig(baseUrl: string, enabled: boolean) {
  ollamaBaseUrl = baseUrl;
  ollamaEnabled = enabled;
}

export function getOllamaConfig() {
  return {
    baseUrl: ollamaBaseUrl,
    enabled: ollamaEnabled,
  };
}

export function isOllamaEnabled(): boolean {
  return ollamaEnabled;
}

export async function checkOllamaConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    
    if (!response.ok) {
      return { connected: false, error: `HTTP ${response.status}` };
    }
    
    return { connected: true };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message || 'Ollama 서버에 연결할 수 없습니다' 
    };
  }
}

export async function listOllamaModels(): Promise<{ models: OllamaModel[]; error?: string }> {
  try {
    const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      return { models: [], error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { models: data.models || [] };
  } catch (error: any) {
    return { 
      models: [], 
      error: error.message || 'Ollama 모델 목록을 가져올 수 없습니다' 
    };
  }
}

export async function generateWithOllama(
  model: string,
  prompt: string,
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<{ response: string; error?: string }> {
  try {
    const requestBody: OllamaChatRequest = {
      model,
      messages: [],
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.maxTokens ?? 2000,
      },
    };
    
    if (systemPrompt) {
      requestBody.messages.push({ role: 'system', content: systemPrompt });
    }
    requestBody.messages.push({ role: 'user', content: prompt });
    
    console.log(`Ollama generating with model: ${model}`);
    
    const response = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { response: '', error: `Ollama error: ${errorText}` };
    }
    
    const data: OllamaChatResponse = await response.json();
    return { response: data.message?.content || '' };
  } catch (error: any) {
    console.error('Ollama generation error:', error);
    return { 
      response: '', 
      error: error.message || 'Ollama 응답 생성 실패' 
    };
  }
}

export const RECOMMENDED_OLLAMA_MODELS = [
  { id: 'llama3.2:3b', name: 'Llama 3.2 3B', size: '2GB', recommended: true },
  { id: 'gemma2:2b', name: 'Gemma 2 2B', size: '1.5GB', recommended: true },
  { id: 'mistral:7b-instruct-q4_0', name: 'Mistral 7B Q4', size: '4GB', recommended: false },
  { id: 'phi3:mini', name: 'Phi-3 Mini', size: '2.3GB', recommended: true },
  { id: 'qwen2:1.5b', name: 'Qwen 2 1.5B', size: '1GB', recommended: true },
];
