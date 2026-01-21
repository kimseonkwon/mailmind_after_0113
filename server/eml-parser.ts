import { simpleParser, ParsedMail, Attachment } from "mailparser";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import pdf from "pdf-parse";

export interface ParsedEmailFromEML {
  subject: string;
  sender: string;
  date: string;
  body: string;
  importance?: string;
  label?: string;
  attachments?: Array<{
    originalName: string;
    storedName: string;
    relPath: string;
    size: number;
    mime?: string;
    pdfText?: string;
  }>;
}

export interface EMLParseResult {
  emails: ParsedEmailFromEML[];
  totalCount: number;
  errorCount: number;
  errors: string[];
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string | null> {
  try {
    const data = await pdf(buffer);
    return data.text || null;
  } catch (err) {
    console.error("PDF 텍스트 추출 실패:", err);
    return null;
  }
}

function formatEmailDate(date: Date | undefined): string {
  if (!date) return new Date().toISOString();
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

export async function parseEMLFile(filePath: string): Promise<EMLParseResult> {
  const errors: string[] = [];
  
  try {
    const fileContent = fs.readFileSync(filePath);
    const parsed = await simpleParser(fileContent);
    
    const email = await convertParsedMailToEmail(parsed, path.basename(filePath));
    
    return {
      emails: [email],
      totalCount: 1,
      errorCount: 0,
      errors: [],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(`EML 파일 파싱 실패: ${errMsg}`);
    return {
      emails: [],
      totalCount: 0,
      errorCount: 1,
      errors,
    };
  }
}

export async function parseEMLFromBuffer(buffer: Buffer, filename: string): Promise<EMLParseResult> {
  const errors: string[] = [];
  
  try {
    const parsed = await simpleParser(buffer);
    const email = await convertParsedMailToEmail(parsed, filename);
    
    return {
      emails: [email],
      totalCount: 1,
      errorCount: 0,
      errors: [],
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(`EML 파일 파싱 실패: ${errMsg}`);
    return {
      emails: [],
      totalCount: 0,
      errorCount: 1,
      errors,
    };
  }
}

export async function parseMultipleEMLFiles(dirPath: string): Promise<EMLParseResult> {
  const emails: ParsedEmailFromEML[] = [];
  const errors: string[] = [];
  
  try {
    const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.eml'));
    
    console.log(`${files.length}개 EML 파일 발견`);
    
    for (const file of files) {
      try {
        const fullPath = path.join(dirPath, file);
        const result = await parseEMLFile(fullPath);
        
        if (result.emails.length > 0) {
          emails.push(...result.emails);
        }
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${file} 파싱 오류: ${errMsg}`);
      }
    }
    
    return {
      emails,
      totalCount: emails.length,
      errorCount: errors.length,
      errors,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    errors.push(`디렉토리 읽기 실패: ${errMsg}`);
    return {
      emails: [],
      totalCount: 0,
      errorCount: 1,
      errors,
    };
  }
}

async function convertParsedMailToEmail(parsed: ParsedMail, sourceFileName: string): Promise<ParsedEmailFromEML> {
  const subject = parsed.subject || "(제목 없음)";
  const sender = parsed.from?.text || parsed.from?.value?.[0]?.address || "unknown@unknown.com";
  const date = formatEmailDate(parsed.date);
  const body = parsed.text || parsed.html || "";
  
  console.log(`\n📧 EML 파싱: ${subject}`);
  console.log(`   첨부파일 개수: ${parsed.attachments?.length || 0}`);
  
  const attachments: ParsedEmailFromEML['attachments'] = [];
  
  if (parsed.attachments && parsed.attachments.length > 0) {
    console.log(`   📎 ${parsed.attachments.length}개 첨부파일 발견`);
    const attachmentDir = path.join(os.tmpdir(), `eml_attachments_${Date.now()}`);
    fs.mkdirSync(attachmentDir, { recursive: true });
    
    for (const att of parsed.attachments) {
      try {
        const originalName = att.filename || `attachment_${attachments.length + 1}`;
        const storedName = `${Date.now()}_${originalName}`;
        const relPath = path.join(attachmentDir, storedName);
        
        console.log(`      - ${originalName} (${att.size} bytes, ${att.contentType})`);
        
        fs.writeFileSync(relPath, att.content);
        
        let pdfText: string | undefined;
        if (att.contentType.includes('pdf') || originalName.toLowerCase().endsWith('.pdf')) {
          pdfText = await extractPdfTextFromBuffer(att.content) || undefined;
          if (pdfText) {
            console.log(`        PDF 텍스트 추출 성공: ${pdfText.length}자`);
          }
        }
        
        attachments.push({
          originalName,
          storedName,
          relPath,
          size: att.size,
          mime: att.contentType,
          pdfText,
        });
        console.log(`        ✓ 파싱 완료, relPath: ${relPath}`);
      } catch (err) {
        console.error(`첨부파일 처리 오류 (${att.filename}):`, err);
      }
    }
  }
  
  console.log(`   ✅ 최종 첨부파일 배열 크기: ${attachments.length}`);
  
  return {
    subject,
    sender,
    date,
    body,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}
