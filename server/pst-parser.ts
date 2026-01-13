import { PSTFile, PSTFolder, PSTMessage } from "pst-extractor";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as iconv from "iconv-lite";
import { htmlToText } from "html-to-text";
import { execSync, spawnSync } from "child_process";

export interface ParsedEmail {
  subject: string;
  sender: string;
  date: string;
  body: string;
  importance?: string;
  label?: string;
  attachments?: ParsedAttachment[];
}

export interface ParsedAttachment {
  originalName: string;
  storedName: string;
  relPath: string;
  size: number;
  mime?: string;
}

export interface PSTParseResult {
  emails: ParsedEmail[];
  totalCount: number;
  errorCount: number;
  errors: string[];
}

export interface PSTParseOptions {
  saveAttachments?: boolean;
  attachmentsDir?: string;
}

function safeBasename(name: string): string {
  const trimmed = (name || "").trim() || "attachment";
  return trimmed
    .replace(/[\\/]/g, "_")
    .replace(/[:*?"<>|]/g, "_")
    .replace(/[\u0000-\u001F]/g, "")
    .slice(0, 180);
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeNodeInputStreamToFile(stream: any, outPath: string) {
  const fd = fs.openSync(outPath, "w");
  try {
    const buf = Buffer.alloc(8176);
    while (true) {
      const n = stream.readBlock(buf);
      if (!n || n <= 0) break;
      fs.writeSync(fd, buf.subarray(0, n));
    }
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
    }
  }
}

function decodeText(text: string | null | undefined): string {
  if (!text) return "";

  try {
    if (!/[\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      return text;
    }

    let buffer: Buffer;

    if (text.includes("\uFFFD") || /[\x80-\xFF]/.test(text)) {
      buffer = Buffer.from(text, "latin1");
    } else {
      buffer = Buffer.from(text, "utf-8");
    }

    const utf8Text = buffer.toString("utf-8");
    if (!utf8Text.includes("\uFFFD") && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(utf8Text)) {
      return utf8Text;
    }

    try {
      const cp949Text = iconv.decode(buffer, "cp949");
      if (!cp949Text.includes("\uFFFD")) return cp949Text;
    } catch {}

    try {
      const eucKrText = iconv.decode(buffer, "euc-kr");
      if (!eucKrText.includes("\uFFFD")) return eucKrText;
    } catch {}

    return text;
  } catch {
    return text || "";
  }
}

function formatDate(date: Date | null): string {
  if (!date) return "";
  try {
    return date.toISOString();
  } catch {
    return "";
  }
}

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

function looksLikeHtml(text: string): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.startsWith("<!DOCTYPE")) return true;
  if (/<(html|head|meta|body|span|font|div|p|br|table)\b/i.test(t)) return true;
  if (/Converted from text\/rtf/i.test(t)) return true;
  return false;
}

function htmlToPlainText(html: string): string {
  try {
    return htmlToText(html, {
      wordwrap: false,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
      ],
    }).trim();
  } catch {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

function stripInjectedHeaderBlock(text: string): string {
  if (!text) return "";

  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;

  const headerKeys = [
    /^stage\s*:/i,
    /^from\s*:/i,
    /^to\s*:/i,
    /^cc\s*:/i,
    /^bcc\s*:/i,
    /^reply\s*required\s*:/i,
    /^date\s*:/i,
    /^sent\s*:/i,
    /^subject\s*:/i,
  ];

  let idx = start;
  let headerLineCount = 0;
  let consumed = 0;

  for (; idx < Math.min(lines.length, start + 15); idx++) {
    const t = lines[idx].trim();

    if (t === "") {
      consumed++;
      break;
    }

    if (headerKeys.some((re) => re.test(t))) {
      headerLineCount++;
      consumed++;
      continue;
    }

    break;
  }

  if (headerLineCount >= 3) {
    const rest = lines.slice(start + consumed);
    while (rest.length && rest[0].trim() === "") rest.shift();
    return rest.join("\n").trim();
  }

  return normalized.trim();
}

function normalizeBody(text: string): string {
  if (!text) return "";

  let t = text;
  t = stripInjectedHeaderBlock(t);
  t = t
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

function extractBody(email: PSTMessage): string {
  const bodyRaw = decodeText(email.body);
  const htmlRaw = decodeText(email.bodyHTML);

  let result = "";

  if (bodyRaw && bodyRaw.trim().length > 0 && !looksLikeHtml(bodyRaw)) {
    result = bodyRaw.trim();
    return normalizeBody(result);
  }

  if (bodyRaw && bodyRaw.trim().length > 0 && looksLikeHtml(bodyRaw)) {
    const converted = htmlToPlainText(bodyRaw);
    if (converted) {
      result = converted;
      return normalizeBody(result);
    }
  }

  if (htmlRaw && htmlRaw.trim().length > 0) {
    const converted = htmlToPlainText(htmlRaw);
    if (converted) {
      result = converted;
      return normalizeBody(result);
    }
  }

  result = (bodyRaw || htmlRaw || "").trim();
  return normalizeBody(result);
}

function extractSenderFromInjectedBodyBlock(rawText: string): string {
  if (!rawText) return "";

  const text = rawText.replace(/\r\n/g, "\n").trim();

  const m1 = text.match(/(?:^|\n)\s*From:\s*([^\n]+)/i);
  if (m1?.[1]) return m1[1].trim();

  const m2 = text.match(/From:\s*(.+?)(?=\s+To:|\s+Cc:|\s+Bcc:|\s+Reply\s*Required:|\s+Date:|\n|$)/i);
  if (m2?.[1]) return m2[1].trim();

  const m3 = text.match(/(?:^|\n)\s*Sender:\s*([^\n]+)/i);
  if (m3?.[1]) return m3[1].trim();

  return "";
}

function extractSender(email: PSTMessage): string {
  const e = email as any;

  const direct =
    decodeText(e.senderEmailAddress) ||
    decodeText(e.senderName) ||
    decodeText(e.sentRepresentingEmailAddress) ||
    decodeText(e.sentRepresentingName) ||
    decodeText(e.senderSmtpAddress) ||
    decodeText(e.sentRepresentingSmtpAddress) ||
    "";

  if (direct.trim()) return direct.trim();

  const headerCandidates = [
    e.transportMessageHeaders,
    e.internetMessageHeaders,
    e.messageHeaders,
    e.headers,
    e.header,
  ];

  for (const hc of headerCandidates) {
    const headers = decodeText(hc) || "";
    if (!headers) continue;

    const fromLine =
      headers.match(/^From:\s*(.+)$/im)?.[1]?.trim() ||
      headers.match(/^Sender:\s*(.+)$/im)?.[1]?.trim() ||
      "";

    if (fromLine) return fromLine;
  }

  const bodyRaw = decodeText(email.body);
  const htmlRaw = decodeText(email.bodyHTML);

  const bodyForParse =
    bodyRaw && looksLikeHtml(bodyRaw) ? htmlToPlainText(bodyRaw) : bodyRaw;

  const htmlForParse = htmlRaw ? htmlToPlainText(htmlRaw) : "";

  const from1 = extractSenderFromInjectedBodyBlock(bodyForParse || "");
  if (from1) return from1;

  const from2 = extractSenderFromInjectedBodyBlock(htmlForParse || "");
  if (from2) return from2;

  return "";
}

function extractAttachments(
  email: PSTMessage,
  opts: PSTParseOptions,
  errors: string[],
  emailKey: string
): ParsedAttachment[] {
  if (!opts.saveAttachments || !opts.attachmentsDir) return [];

  try {
    ensureDir(opts.attachmentsDir);
  } catch (e) {
    errors.push(`Failed to create attachments dir: ${e instanceof Error ? e.message : 'Unknown error'}`);
    return [];
  }

  const out: ParsedAttachment[] = [];
  const count = (email as any).numberOfAttachments ?? 0;
  if (!count || count <= 0) return out;

  const relDir = path.join('_pst', emailKey);
  const absDir = path.join(opts.attachmentsDir, relDir);
  ensureDir(absDir);

  for (let i = 0; i < count; i++) {
    try {
      const att: any = (email as any).getAttachment(i);
      const originalNameRaw = decodeText(att?.longFilename) || decodeText(att?.filename) || `attachment_${i}`;
      const originalName = safeBasename(originalNameRaw);

      const mime = decodeText(att?.mimeTag) || undefined;
      const size = Number(att?.filesize ?? att?.size ?? 0) || 0;

      const storedName = `${String(i).padStart(3, '0')}-${Date.now()}-${originalName}`;
      const relPath = path.join(relDir, storedName);
      const absPath = path.join(opts.attachmentsDir, relPath);

      const stream = att?.fileInputStream;
      if (!stream) {
        errors.push(`Attachment has no fileInputStream (emailKey=${emailKey}, index=${i}, name=${originalNameRaw})`);
        continue;
      }

      writeNodeInputStreamToFile(stream, absPath);

      out.push({
        originalName: originalNameRaw || originalName,
        storedName,
        relPath,
        size: size || (fs.existsSync(absPath) ? fs.statSync(absPath).size : 0),
        mime,
      });
    } catch (err) {
      errors.push(`Error extracting attachment (emailKey=${emailKey}, idx=${i}): ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return out;
}

function processFolder(folder: PSTFolder, emails: ParsedEmail[], errors: string[], opts: PSTParseOptions): void {
  try {
    if (folder.hasSubfolders) {
      const subFolders = folder.getSubFolders();
      for (const subFolder of subFolders) {
        processFolder(subFolder, emails, errors, opts);
      }
    }

    if (folder.contentCount > 0) {
      let email: PSTMessage | null = folder.getNextChild();
      while (email !== null) {
        try {
          const emailKey = `${emails.length + 1}_${Date.now()}`;

          const attachments = extractAttachments(email, opts, errors, emailKey);
          const parsed: ParsedEmail = {
            subject: decodeText(email.subject) || "(제목 없음)",
            sender: extractSender(email),
            date: formatDate(email.messageDeliveryTime || email.clientSubmitTime),
            body: extractBody(email),
            importance: getImportance(email.importance),
            label: decodeText(folder.displayName) || undefined,
            attachments,
          };
          emails.push(parsed);
        } catch (err) {
          errors.push(`Error parsing email: ${err instanceof Error ? err.message : "Unknown error"}`);
        }
        email = folder.getNextChild();
      }
    }
  } catch (err) {
    errors.push(
      `Error processing folder ${folder.displayName}: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

function parseWithReadpst(filePath: string, opts: PSTParseOptions = {}): PSTParseResult {
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  
  const outputDir = path.join(os.tmpdir(), `readpst_${Date.now()}`);
  
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    
    const result = spawnSync("readpst", ["-e", "-o", outputDir, filePath], {
      encoding: "utf-8",
      timeout: 300000,
    });
    
    if (result.error) {
      throw new Error(`readpst 실행 오류: ${result.error.message}`);
    }
    
    if (result.status !== 0 && result.stderr) {
      console.log("readpst stderr:", result.stderr);
    }
    
    const processOutputDir = (dir: string, folderLabel?: string): void => {
      if (!fs.existsSync(dir)) return;
      
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          processOutputDir(itemPath, item);
        } else if (item.endsWith(".eml")) {
          try {
            const emlContent = fs.readFileSync(itemPath, "utf-8");
            const parsed = parseEmlContent(emlContent, folderLabel);
            if (parsed) {
              emails.push(parsed);
            }
          } catch (e) {
            errors.push(`EML 파싱 오류 (${item}): ${e instanceof Error ? e.message : "Unknown"}`);
          }
        }
      }
    };
    
    processOutputDir(outputDir);
    
  } catch (err) {
    errors.push(`readpst 파싱 실패: ${err instanceof Error ? err.message : "Unknown error"}`);
  } finally {
    try {
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    } catch {}
  }
  
  return {
    emails,
    totalCount: emails.length,
    errorCount: errors.length,
    errors,
  };
}

function parseEmlContent(content: string, label?: string): ParsedEmail | null {
  const lines = content.split(/\r?\n/);
  let subject = "";
  let sender = "";
  let date = "";
  let inBody = false;
  let bodyLines: string[] = [];
  let headerName = "";
  let headerValue = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!inBody) {
      if (line === "" || line === "\r") {
        inBody = true;
        continue;
      }
      
      if (line.startsWith(" ") || line.startsWith("\t")) {
        headerValue += " " + line.trim();
      } else {
        if (headerName) {
          applyHeader(headerName, headerValue);
        }
        
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          headerName = line.substring(0, colonIdx).toLowerCase();
          headerValue = line.substring(colonIdx + 1).trim();
        }
      }
    } else {
      bodyLines.push(line);
    }
  }
  
  if (headerName) {
    applyHeader(headerName, headerValue);
  }
  
  function applyHeader(name: string, value: string) {
    const decoded = decodeRfc2047(value);
    switch (name) {
      case "subject":
        subject = decoded;
        break;
      case "from":
        sender = decoded;
        break;
      case "date":
        try {
          const d = new Date(value);
          if (!isNaN(d.getTime())) {
            date = d.toISOString();
          } else {
            date = value;
          }
        } catch {
          date = value;
        }
        break;
    }
  }
  
  let body = bodyLines.join("\n").trim();
  
  if (looksLikeHtml(body)) {
    body = htmlToPlainText(body);
  }
  
  body = normalizeBody(body);
  
  if (!subject && !body) {
    return null;
  }
  
  return {
    subject: subject || "(제목 없음)",
    sender: sender || "(발신자 없음)",
    date,
    body,
    importance: "normal",
    label,
  };
}

function decodeRfc2047(text: string): string {
  if (!text) return "";
  
  return text.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, encoding, encoded) => {
    try {
      if (encoding.toUpperCase() === "B") {
        const buf = Buffer.from(encoded, "base64");
        return iconv.decode(buf, charset);
      } else if (encoding.toUpperCase() === "Q") {
        const decoded = encoded.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (m: string, hex: string) => {
          return String.fromCharCode(parseInt(hex, 16));
        });
        const buf = Buffer.from(decoded, "binary");
        return iconv.decode(buf, charset);
      }
    } catch {}
    return match;
  });
}

export function parsePSTFile(filePath: string, opts: PSTParseOptions = {}): PSTParseResult {
  const emails: ParsedEmail[] = [];
  const errors: string[] = [];
  let usedFallback = false;

  try {
    const pstFile = new PSTFile(filePath);
    const rootFolder = pstFile.getRootFolder();
    processFolder(rootFolder, emails, errors, opts);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    console.log(`pst-extractor 실패, readpst로 재시도: ${errMsg}`);
    
    const fallbackResult = parseWithReadpst(filePath, opts);
    usedFallback = true;
    
    if (fallbackResult.emails.length > 0) {
      return fallbackResult;
    }
    
    if (errMsg.includes("findBtreeItem") || errMsg.includes("Unable to find")) {
      errors.push(`PST 파일 형식 오류: Unicode PST 형식이지만 파싱에 실패했습니다. (${errMsg})`);
    } else if (errMsg.includes("password") || errMsg.includes("encrypted")) {
      errors.push(`PST 파일이 암호로 보호되어 있습니다. 암호를 해제한 후 다시 시도해주세요.`);
    } else {
      errors.push(`PST 파일 열기 실패: ${errMsg}`);
    }
    
    errors.push(...fallbackResult.errors);
  }

  return {
    emails,
    totalCount: emails.length,
    errorCount: errors.length,
    errors,
  };
}

export function parsePSTFromBuffer(buffer: Buffer, filename: string, opts: PSTParseOptions = {}): PSTParseResult {
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `pst_${Date.now()}_${filename}`);

  try {
    fs.writeFileSync(tempPath, buffer);
    const result = parsePSTFile(tempPath, opts);
    return result;
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
    }
  }
}
