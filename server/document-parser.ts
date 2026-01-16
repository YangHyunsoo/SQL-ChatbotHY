import officeParser from 'officeparser';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ParsedDocument {
  text: string;
  pageCount: number;
  hasOcr: boolean;
  metadata?: Record<string, any>;
}

export interface ChunkOptions {
  chunkSize: number;
  chunkOverlap: number;
}

const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  chunkSize: 500,
  chunkOverlap: 50,
};

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ParsedDocument> {
  const ext = path.extname(fileName).toLowerCase();
  
  try {
    switch (ext) {
      case '.pdf':
        return await parsePdf(buffer);
      case '.doc':
      case '.docx':
        return await parseWord(buffer);
      case '.ppt':
      case '.pptx':
        return await parsePowerPoint(buffer);
      default:
        throw new Error(`지원하지 않는 파일 형식입니다: ${ext}`);
    }
  } catch (error) {
    console.error('Document parsing error:', error);
    throw error;
  }
}

async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const data = await pdfParse(buffer);
    let text = data.text || '';
    let hasOcr = false;
    
    if (!text.trim() || text.trim().length < 100) {
      console.log('PDF appears to be image-based, attempting OCR...');
      const ocrResult = await performOcrOnPdf(buffer);
      if (ocrResult.text.length > text.length) {
        text = ocrResult.text;
        hasOcr = true;
      }
    }
    
    return {
      text: cleanText(text),
      pageCount: data.numpages || 1,
      hasOcr,
      metadata: {
        info: data.info,
        version: data.version,
      },
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    try {
      const ocrResult = await performOcrOnPdf(buffer);
      return {
        text: cleanText(ocrResult.text),
        pageCount: 1,
        hasOcr: true,
      };
    } catch (ocrError) {
      throw new Error('PDF 파싱에 실패했습니다. OCR도 실패했습니다.');
    }
  }
}

async function performOcrOnPdf(buffer: Buffer): Promise<{ text: string }> {
  try {
    const tempDir = '/tmp/ocr';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempPdfPath = path.join(tempDir, `temp_${Date.now()}.pdf`);
    fs.writeFileSync(tempPdfPath, buffer);
    
    const worker = await Tesseract.createWorker('kor+eng');
    
    try {
      const result = await worker.recognize(tempPdfPath);
      return { text: result.data.text };
    } finally {
      await worker.terminate();
      if (fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }
    }
  } catch (error) {
    console.error('OCR error:', error);
    return { text: '' };
  }
}

async function parseWord(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value || '';
    
    const paragraphs = text.split(/\n\n+/);
    const estimatedPages = Math.ceil(paragraphs.length / 20);
    
    return {
      text: cleanText(text),
      pageCount: estimatedPages,
      hasOcr: false,
    };
  } catch (error) {
    console.error('Word parsing error:', error);
    try {
      const result = await officeParser.parseOffice(buffer);
      const text = typeof result === 'string' ? result : (result as any).toString?.() || '';
      return {
        text: cleanText(text),
        pageCount: 1,
        hasOcr: false,
      };
    } catch (fallbackError) {
      throw new Error('Word 문서 파싱에 실패했습니다.');
    }
  }
}

async function parsePowerPoint(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await officeParser.parseOffice(buffer);
    const text = typeof result === 'string' ? result : (result as any).toString?.() || '';
    
    const slides = text.split(/\n{3,}/).filter((s: string) => s.trim());
    
    return {
      text: cleanText(text),
      pageCount: slides.length || 1,
      hasOcr: false,
    };
  } catch (error) {
    console.error('PowerPoint parsing error:', error);
    throw new Error('PowerPoint 파싱에 실패했습니다.');
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function chunkText(
  text: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS
): string[] {
  const { chunkSize, chunkOverlap } = options;
  
  const sentences = text.split(/(?<=[.!?。！？])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentLength = 0;
  
  for (const sentence of sentences) {
    const sentenceLength = sentence.length;
    
    if (currentLength + sentenceLength > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(chunkOverlap / 5));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
      currentLength = currentChunk.length;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentLength += sentenceLength + 1;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  if (chunks.length === 0 && text.trim()) {
    const words = text.split(/\s+/);
    let chunk = '';
    for (const word of words) {
      if (chunk.length + word.length + 1 > chunkSize) {
        if (chunk) chunks.push(chunk);
        chunk = word;
      } else {
        chunk += (chunk ? ' ' : '') + word;
      }
    }
    if (chunk) chunks.push(chunk);
  }
  
  return chunks;
}

export function getFileType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const typeMap: Record<string, string> = {
    '.pdf': 'pdf',
    '.doc': 'doc',
    '.docx': 'docx',
    '.ppt': 'ppt',
    '.pptx': 'pptx',
  };
  return typeMap[ext] || 'unknown';
}

export function isValidFileType(fileName: string): boolean {
  const validTypes = ['.pdf', '.doc', '.docx', '.ppt', '.pptx'];
  const ext = path.extname(fileName).toLowerCase();
  return validTypes.includes(ext);
}
