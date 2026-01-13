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
  model: string = "llama3.2"
): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
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

    const events = JSON.parse(jsonMatch[0]);
    return Array.isArray(events) ? events : [];
  } catch (error) {
    console.error("Event extraction error:", error);
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

export async function generateEmailChunks(
  emailId: number,
  subject: string,
  sender: string,
  date: string,
  body: string,
  chunkSize: number = 500
): Promise<Array<{ content: string; embedding: number[] }>> {
  const chunks: Array<{ content: string; embedding: number[] }> = [];
  
  const headerText = `제목: ${subject}\n발신자: ${sender}\n날짜: ${date}`;
  
  const cleanBody = body.replace(/\s+/g, " ").trim();
  const words = cleanBody.split(" ");
  
  let currentChunk = headerText + "\n\n";
  
  for (const word of words) {
    if ((currentChunk + " " + word).length > chunkSize && currentChunk.length > headerText.length + 10) {
      const embedding = await generateEmbedding(currentChunk);
      if (embedding) {
        chunks.push({ content: currentChunk, embedding });
      }
      currentChunk = headerText + "\n\n" + word;
    } else {
      currentChunk += (currentChunk.endsWith("\n\n") ? "" : " ") + word;
    }
  }
  
  if (currentChunk.length > headerText.length + 10) {
    const embedding = await generateEmbedding(currentChunk);
    if (embedding) {
      chunks.push({ content: currentChunk, embedding });
    }
  }
  
  if (chunks.length === 0) {
    const fullText = headerText + "\n\n" + cleanBody.substring(0, chunkSize);
    const embedding = await generateEmbedding(fullText);
    if (embedding) {
      chunks.push({ content: fullText, embedding });
    }
  }
  
  return chunks;
}
