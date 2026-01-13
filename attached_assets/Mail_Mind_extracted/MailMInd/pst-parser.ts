import { PSTFile, PSTFolder, PSTMessage } from "pst-extractor";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as iconv from "iconv-lite";

/* =========================
   타입 정의
========================= */
export interface ParsedEmail {
  subject: string;
  sender: string;
  date: string;
  body: string;
  importance?: string;
  label?: string;
}

export interface PSTParseResult {
  emails: ParsedEmail[];
  totalCount: number;
  errorCount: number;
  errors: string[];
}

/* =========================
   텍스트 디코딩 (한글 깨짐 방지)
========================= */
function decodeText(text: string | null | undefined): string {
  if (!text) return "";

  try {
    if (!/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      return text;
    }

    let buffer: Buffer;

    if (text.includes("�") || /[\x80-\xFF]/.test(text)) {
      buffer = Buffer.from(text, "latin1");
    } else {
      buffer = Buffer.from(text, "utf-8");
    }

    const utf8 = buffer.toString("utf-8");
    if (!utf8.includes("�")) return utf8;

    try {
      const cp949 = iconv.decode(buffer, "cp949");
      if (!cp949.includes("�")) return cp949;
    } catch {}

    try {
      const eucKr = iconv.decode(buffer, "euc-kr");
      if (!eucKr.includes("�")) return eucKr;
    } catch {}

    return text;
  } catch {
    return text || "";
  }
}

/* =========================
   날짜 포맷
========================= */
function formatDate(date: Date | null): string {
  if (!date) return "";
  try {
    return date.toISOString();
  } catch {
    return "";
  }
}

/* =========================
   중요도 변환
========================= */
function getImportance(importance: number): string {
  switch (importance) {
    case 2:
      return "high";
    case 0:
      return "low";
    default:
      return "normal";
  }
}

/* =========================
   🔥 핵심: 이메일 본문 추출
========================= */
function extractEmailBody(email: PSTMessage): string {
  try {
    const anyEmail = email as any;

    // 1️⃣ Plain text (가장 정확)
    if (typeof anyEmail.getBodyText === "function") {
      const text = anyEmail.getBodyText();
      if (text && text.trim().length > 0) {
        return decodeText(text);
      }
    }

    // 2️⃣ HTML → 텍스트 변환
    if (email.bodyHTML && email.bodyHTML.trim().length > 0) {
      const stripped = email.bodyHTML
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (stripped.length > 0) {
        return decodeText(stripped);
      }
    }

    // 3️⃣ PST 기본 body fallback
    if (email.body && email.body.trim().length > 0) {
      return decodeText(email.body);
    }

    return "";
  } catch {
    return "";
  }
}

/* =========================
   폴더 재귀 처리
========================= */
function processFolder(
  folder: PSTFolder,
  emails: ParsedEmail[],
  errors: string[]
): void {
  try {
    if (folder.hasSubfolders) {
      for (const sub of folder.getSubFolders()) {
        processFolder(sub, emails, errors);
      }
    }

    if (folder.contentCount > 0) {
      let msg: PSTMessage | null = folder.getNextChild();

      while (msg !== null) {
        try {
          const parsed: ParsedEmail = {
            subject: decodeText(msg.subject) || "(제목 없음)",
            sender:
              decodeText(msg.senderEmailAddress || msg.senderName) || "",
            date: formatDate(
              msg.messageDeliveryTime || msg.clientSubmitTime
            ),
            body: extractEmailBody(msg), // 🔥 여기 중요
            importance: getImportance(msg.importance),
            label: decodeText(folder.displayName) || undefined,
          };

          emails.push(parsed);
        } catch (err) {
          errors.push(
            `Error parsing email: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }

        msg = folder.getNextChild();
      }
    }
  } catch (err) {
    errors.push(
      `Error processing folder ${folder.displayName}: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
  }
}

/* =========================
   PST 파일 파싱
========================= */
export function parsePSTFile(filePath: string): PSTParseResult {
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];

  try {
    const pst = new PSTFile(filePath);
    const root = pst.getRootFolder();
    processFolder(root, emails, errors);
  } catch (err) {
    errors.push(
      `Failed to open PST file: ${
        err instanceof Error ? err.message : "Unknown error"
      }`
    );
  }

  return {
    emails,
    totalCount: emails.length,
    errorCount: errors.length,
    errors,
  };
}

/* =========================
   Buffer 기반 PST 파싱
========================= */
export function parsePSTFromBuffer(
  buffer: Buffer,
  filename: string
): PSTParseResult {
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `pst_${Date.now()}_${filename}`);

  try {
    fs.writeFileSync(tempPath, buffer);
    return parsePSTFile(tempPath);
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
  }
}
