import type { ExtractedEvent } from "@shared/schema";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export async function chatWithOllama(
  messages: OllamaMessage[],
  model: string = "llama3.2",
  temperature: number = 0.3
): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: 512,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data: OllamaResponse = await response.json();
    return data.message.content;
  } catch (error) {
    console.error("Ollama chat error:", error);
    throw new Error("AI 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인해주세요.");
  }
}

export async function extractEventsFromEmail(
  emailSubject: string,
  emailBody: string,
  emailDate: string
): Promise<ExtractedEvent[]> {
  const systemPrompt = `당신은 이메일에서 일정/이벤트 정보를 추출하는 AI 비서입니다.
이메일 내용을 분석하여 일정 정보를 JSON 형식으로 추출해주세요.

반드시 다음 JSON 배열 형식으로만 응답하세요:
[
  {
    "title": "일정 제목",
    "startDate": "YYYY-MM-DD HH:mm",
    "endDate": "YYYY-MM-DD HH:mm",
    "location": "장소",
    "description": "설명"
  }
]

일정이 없으면 빈 배열 []을 반환하세요.
날짜가 명시되지 않은 경우 이메일 날짜(${emailDate})를 기준으로 추정하세요.`;

  const userPrompt = `다음 이메일에서 일정 정보를 추출해주세요:

제목: ${emailSubject}

내용:
${emailBody}`;

  try {
    const response = await chatWithOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return [];
    }

    // Clean up common LLM JSON issues: remove comments, trailing commas
    let jsonStr = jsonMatch[0]
      .replace(/\/\/[^\n]*/g, '')  // Remove // comments
      .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove /* */ comments
      .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
      .replace(/,\s*}/g, '}')  // Remove trailing commas before }
      .trim();

    // If it's effectively an empty array, return early
    if (jsonStr === '[]' || jsonStr.replace(/\s/g, '') === '[]') {
      return [];
    }

    const events = JSON.parse(jsonStr);
    return Array.isArray(events) ? events : [];
  } catch (error) {
    // Only log actual parsing failures, not empty responses
    if (error instanceof SyntaxError) {
      // Silently ignore - this is normal for emails without events
    } else {
      console.error("Event extraction error:", error);
    }
    return [];
  }
}

export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function getAvailableModels(): Promise<string[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map((m: { name: string }) => m.name) || [];
  } catch {
    return [];
  }
}

export async function checkRequiredModels(): Promise<{ chat: boolean; embed: boolean; models: string[] }> {
  try {
    const models = await getAvailableModels();
    const chatModel = process.env.OLLAMA_MODEL || "llama3.2";
    const embedModel = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
    
    const hasChat = models.some(m => m.includes(chatModel.split(":")[0]));
    const hasEmbed = models.some(m => m.includes(embedModel.split(":")[0]));
    
    return { chat: hasChat, embed: hasEmbed, models };
  } catch {
    return { chat: false, embed: false, models: [] };
  }
}

export type EmailClassification = "task" | "meeting" | "approval" | "notice";

export interface ClassificationResult {
  classification: EmailClassification;
  confidence: string;
}

export async function classifyEmail(
  subject: string,
  body: string,
  sender: string
): Promise<ClassificationResult> {
  const systemPrompt = `당신은 이메일 분류 AI입니다.
아래 4개 중 하나로만 반드시 분류하세요.

카테고리 정의:
- task: 업무 요청, 작업 지시, 검토 요청
- meeting: 회의 일정, 미팅 요청, 참석 요청
- approval: 결재 요청, 승인 요청, 검토 후 승인
- notice: 공지, 안내, 알림, 정보 공유

반드시 다음 JSON 형식으로만 응답하세요:
{"classification": "task | meeting | approval | notice", "confidence": "high | medium | low"}`;

  const userPrompt = `다음 이메일을 분류해주세요:
발신자: ${sender}
제목: ${subject}
내용: ${body.substring(0, 500)}`;

  try {
    const response = await chatWithOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const allowed: EmailClassification[] = ["task", "meeting", "approval", "notice"];
      const classification: EmailClassification = allowed.includes(result.classification) 
        ? result.classification 
        : "task";
      const confidence = ["high", "medium", "low"].includes(result.confidence) 
        ? result.confidence 
        : "medium";
      return { classification, confidence };
    }
    return { classification: "task", confidence: "low" };
  } catch (error) {
    console.error("Classification error:", error);
    return { classification: "task", confidence: "low" };
  }
}
// server/ollama.ts

function extractJsonObject(text: string): any | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const jsonStr = text.slice(start, end + 1);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export async function normalizeQuestionForRag(rawQuestion: string): Promise<{
  normalized: string;
  queryForRetrieval: string;
  queryForLLM: string;
}> {
  const fallbackNormalized = (rawQuestion || "").replace(/\s+/g, " ").trim();
  if (!fallbackNormalized) {
    return { normalized: "", queryForRetrieval: "", queryForLLM: "" };
  }

  const system = `
너는 조선소 이메일 검색을 위한 질문 분석 AI다.
사용자 질문에서 핵심 키워드만 추출하여 JSON으로 출력해라.

중요 규칙:
1) normalized: 원래 질문에서 조사만 제거한 형태 (질문 의도 유지)
2) query_for_retrieval: 검색용 핵심 키워드만 (호선번호, 주요명사, 이슈명)
   - 예: "S-5678 주기관 엔진 입고 지연"
   - 예: "안전 점검 일정"
   - 예: "용접 불량 A8"
3) query_for_llm: 원래 질문 그대로 유지
4) **절대로 질문에 없는 단어를 추가하지 마라** (예: 질문에 "용접"이 없으면 "용접" 추가 금지)
5) 호선번호는 반드시 원형 유지 (S-5678, H-1234 등)

반드시 JSON만 출력:
{
  "normalized": "...",
  "query_for_retrieval": "...",
  "query_for_llm": "..."
}
`;

  const out = await chatWithOllama([
    { role: "system", content: system },
    { role: "user", content: rawQuestion }
  ]);

  const obj = extractJsonObject(out);
  if (!obj?.normalized || !obj?.query_for_retrieval || !obj?.query_for_llm) {
    // fallback: 원래 질문 그대로 사용
    return {
      normalized: fallbackNormalized,
      queryForRetrieval: fallbackNormalized,
      queryForLLM: fallbackNormalized,
    };
  }

  return {
    normalized: String(obj.normalized).trim(),
    queryForRetrieval: String(obj.query_for_retrieval).trim(),
    queryForLLM: String(obj.query_for_llm).trim(),
  };
}
// server/ollama.ts

export async function summarizeEmailForRag(subject: string, sender: string, date: string, body: string): Promise<{
  summary: string;
  keywords: string[];
}> {
  const cleanBody = (body || "").replace(/\s+/g, " ").trim().slice(0, 6000);

  const system = `
너는 조선/제조 현장 이메일을 RAG 청크로 만들기 위한 요약기다.
아래 JSON만 출력해라.

규칙:
- summary: 2~4문장, 사건/이슈/요청/결론 중심(불필요한 인사말 제거)
- keywords: 6~12개, 명사/핵심 용어/프로젝트/호선/이슈 키워드 위주
- 한국어 유지, 배열은 문자열만

반드시 JSON:
{
  "summary": "...",
  "keywords": ["...", "..."]
}
`;

  const user = `제목: ${subject}\n발신자: ${sender}\n날짜: ${date}\n본문: ${cleanBody}`;

  const out = await chatWithOllama([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  const obj = extractJsonObject(out);
  if (!obj?.summary || !Array.isArray(obj?.keywords)) {
    // fallback
    const fallbackSummary = cleanBody.slice(0, 240);
    const fallbackKeywords = cleanBody.split(/\s+/).slice(0, 10);
    return { summary: fallbackSummary, keywords: fallbackKeywords };
  }

  const keywords = obj.keywords
    .map((k: any) => String(k).trim())
    .filter((k: string) => k.length > 0)
    .slice(0, 12);

  return {
    summary: String(obj.summary).trim(),
    keywords,
  };
}

export async function chatWithEmailContext(
  message: string,
  emailContext: Array<{ subject: string; body: string; sender: string; date: string }>
): Promise<string> {
  const contextText = emailContext
    .map((e, i) => `[이메일 ${i + 1}]\n제목: ${e.subject}\n발신자: ${e.sender}\n날짜: ${e.date}\n내용: ${e.body.substring(0, 300)}...`)
    .join("\n\n");

  const systemPrompt = `당신은 이메일 관리와 일정 정리를 도와주는 AI 비서입니다. 
사용자가 업로드한 이메일 데이터를 기반으로 질문에 답변해주세요.
아래는 관련 이메일 내용입니다:

${contextText}

이 정보를 바탕으로 사용자의 질문에 친절하게 답변해주세요.`;

  return chatWithOllama([
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ]);
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: text.substring(0, 8000),
      }),
    });

    if (!response.ok) {
      console.error(`Embedding API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const embedding = data.embedding || data.embeddings?.[0] || null;
    
    if (!embedding || !Array.isArray(embedding)) {
      console.error("Invalid embedding response:", JSON.stringify(data).substring(0, 200));
      return null;
    }
    
    return embedding;
  } catch (error) {
    console.error("Embedding generation error:", error);
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RagChunk {
  id: number;
  emailId: number;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

function splitKoreanSentences(text: string): string[] {
  const sentences: string[] = [];
  const delimiterPattern = /[.?!。！？\n]+/;
  const parts = text.split(delimiterPattern);
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length > 0) {
      sentences.push(trimmed);
    }
  }
  
  return sentences.length > 0 ? sentences : [text.trim()];
}

// server/ollama.ts

export async function generateEmailChunks(
  emailId: number,
  subject: string,
  sender: string,
  date: string,
  body: string,
  chunkSize: number = 900,       // "원문 일부" 길이 기준으로 재해석
  overlapSentences: number = 0   // 더 이상 문장 오버랩 안 씀(호환용 파라미터)
): Promise<Array<{ content: string; embedding: number[] }>> {
  const chunks: Array<{ content: string; embedding: number[] }> = [];

  const headerText = `메일ID: ${emailId}\n제목: ${subject}\n발신자: ${sender}\n날짜: ${date}`;
  const cleanBody = (body || "").replace(/\s+/g, " ").trim();

  // 1) 요약 + 키워드 (LLM 1회)
  const { summary, keywords } = await summarizeEmailForRag(subject, sender, date, cleanBody);

  // 2) 원문 일부를 여러 조각으로(길면 여러 chunk)
  const excerptStep = Math.max(300, chunkSize - 200);
  const maxChunksPerEmail = 4;

  for (let i = 0, c = 0; i < cleanBody.length && c < maxChunksPerEmail; i += excerptStep, c++) {
    const excerpt = cleanBody.slice(i, i + chunkSize);

    const content =
`${headerText}

[사건 요약]
${summary}

[키워드]
- ${keywords.join("\n- ")}

[원문 일부]
${excerpt}
`;

    const embedding = await generateEmbedding(content);
    if (embedding) {
      chunks.push({ content, embedding });
    }
  }

  // 본문이 매우 짧아서 루프가 0개였을 경우 대비
  if (chunks.length === 0) {
    const content =
`${headerText}

[사건 요약]
${summary}

[키워드]
- ${keywords.join("\n- ")}

[원문 일부]
${cleanBody.slice(0, chunkSize)}
`;
    const embedding = await generateEmbedding(content);
    if (embedding) chunks.push({ content, embedding });
  }

  return chunks;
}


export function getShipbuildingSystemPrompt(emailContext: string): string {
  return `당신은 조선소 이메일 관리 AI 비서입니다.

【절대 규칙 - 반드시 준수】
1. 한국어로만 답변 (영어, 중국어, 일본어, 스페인어 등 외국어 절대 사용 금지)
2. 아래 CONTEXT에 있는 정보만 사용
3. CONTEXT가 질문과 무관하면 "해당 질문과 관련된 이메일을 찾지 못했습니다"만 답변
4. 추측, 상상, 가상 정보 생성 금지

【이메일 CONTEXT】
${emailContext || "(이메일 없음)"}

【답변 방법】
- 100% 한국어만 사용
- CONTEXT의 사실만 언급
- 답변은 한 문장으로 요약
- 관련 없으면 "찾지 못했습니다" 답변
- 간결하고 명확하게
`;
}

