import officeParser from 'officeparser';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Import pdf-parse (CommonJS module)
import * as pdfParseModule from 'pdf-parse';
const pdfParseLib = (pdfParseModule as any).default || pdfParseModule;

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
  let pageCount = 1;
  
  try {
    const data = await pdfParseLib(buffer);
    const text = data.text || '';
    pageCount = data.numpages || 1;
    
    // If we got meaningful text (more than 100 chars), use it
    if (text.trim().length > 100) {
      return {
        text: cleanText(text),
        pageCount,
        hasOcr: false,
        metadata: {
          info: data.info,
          version: data.version,
        },
      };
    }
    
    // Text too short - likely image-based PDF, try OCR
    console.log('PDF appears to be image-based, attempting OCR...');
  } catch (error) {
    console.log('PDF text extraction failed, attempting OCR...', error);
  }
  
  // Try OCR for image-based PDF
  try {
    const ocrResult = await performOcrOnPdf(buffer, pageCount);
    if (ocrResult.text.trim().length > 0) {
      return {
        text: cleanText(ocrResult.text),
        pageCount: ocrResult.pageCount,
        hasOcr: true,
      };
    }
    throw new Error('OCR에서 텍스트를 추출할 수 없습니다.');
  } catch (ocrError) {
    console.error('OCR failed:', ocrError);
    throw new Error('PDF 파싱에 실패했습니다. 텍스트 추출과 OCR 모두 실패했습니다.');
  }
}

// Convert PDF to images using pdftoppm, then OCR each page
async function performOcrOnPdf(buffer: Buffer, estimatedPages: number): Promise<{ text: string; pageCount: number }> {
  const tempDir = `/tmp/ocr_${Date.now()}`;
  const pdfPath = path.join(tempDir, 'input.pdf');
  
  try {
    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(pdfPath, buffer);
    
    // Convert PDF to PNG images using pdftoppm
    const outputPrefix = path.join(tempDir, 'page');
    await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPrefix}"`, { timeout: 60000 });
    
    // Find all generated image files
    const files = fs.readdirSync(tempDir).filter(f => f.startsWith('page') && f.endsWith('.png'));
    files.sort(); // Ensure pages are in order
    
    if (files.length === 0) {
      throw new Error('PDF를 이미지로 변환할 수 없습니다.');
    }
    
    // Create Tesseract worker for Korean + English
    const worker = await Tesseract.createWorker('kor+eng');
    
    try {
      const textParts: string[] = [];
      
      // OCR each page (limit to first 20 pages for performance)
      const pagesToProcess = files.slice(0, 20);
      for (const file of pagesToProcess) {
        const imagePath = path.join(tempDir, file);
        const result = await worker.recognize(imagePath);
        if (result.data.text.trim()) {
          textParts.push(result.data.text);
        }
      }
      
      return {
        text: textParts.join('\n\n'),
        pageCount: files.length,
      };
    } finally {
      await worker.terminate();
    }
  } finally {
    // Cleanup temp files
    try {
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      }
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }
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
