import type { ExtractedEvent } from "@shared/schema";

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434";

/* =========================
   Ollama 공통 타입
========================= */
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

/* =========================
   Ollama Chat
========================= */
export async function chatWithOllama(
  messages: OllamaMessage[],
  model: string = "llama3.2"
): Promise<string> {
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
}

/* =========================
   일정 추출
========================= */
export async function extractEventsFromEmail(
  emailSubject: string,
  emailBody: string,
  emailDate: string
): Promise<ExtractedEvent[]> {
  const systemPrompt = `
당신은 이메일에서 일정 정보를 추출하는 전문가입니다.

규칙:
- startDate 없는 일정은 제외
- 날짜 형식: YYYY-MM-DD 또는 YYYY-MM-DD HH:mm
- 일정 없으면 [] 반환
- 반드시 JSON 배열만 반환
`;

  const userPrompt = `
이메일 제목: ${emailSubject}
이메일 본문:
${emailBody}
수신 날짜: ${emailDate}
`;

  try {
    const response = await chatWithOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const events = JSON.parse(jsonMatch[0]);
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

/* =========================
   Ollama 상태 확인
========================= */
export async function checkOllamaConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

/* =========================
   이메일 분류 (🔥 핵심)
========================= */

export type EmailClassification =
  | "task"
  | "meeting"
  | "approval"
  | "notice";

export interface ClassificationResult {
  classification: EmailClassification;
  confidence: "high" | "medium" | "low";
}

/** 🔥 절대 실패하지 않는 분류기 */
export async function classifyEmail(
  subject: string,
  body: string,
  sender: string
): Promise<ClassificationResult> {

  const systemPrompt = `
당신은 이메일 분류 AI입니다.
아래 4개 중 하나로만 반드시 분류하세요.

카테고리 정의:
- task: 업무 요청, 작업 지시, 검토 요청
- meeting: 회의 일정, 미팅 요청, 참석 요청
- approval: 결재 요청, 승인 요청, 검토 후 승인
- notice: 공지, 안내, 알림, 정보 공유

❌ reference, 기타, unknown, none 절대 사용 금지
❌ 반드시 아래 4개 중 하나만 선택

반드시 JSON 형식으로만 응답:
{
  "classification": "task | meeting | approval | notice",
  "confidence": "high | medium | low"
}
`;

  const userPrompt = `
발신자: ${sender}
제목: ${subject}
내용:
${body.substring(0, 1000)}
`;

  try {
    const raw = await chatWithOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    console.log("[Ollama RAW RESPONSE]", raw);

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Classification] JSON 파싱 실패 → task 기본값");
      return { classification: "task", confidence: "low" };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    const allowed: EmailClassification[] = [
      "task",
      "meeting",
      "approval",
      "notice",
    ];

    const classification: EmailClassification =
      allowed.includes(parsed.classification)
        ? parsed.classification
        : "task";

    const confidence =
      parsed.confidence === "high" ||
      parsed.confidence === "medium" ||
      parsed.confidence === "low"
        ? parsed.confidence
        : "medium";

    return {
      classification,
      confidence,
    };

  } catch (error) {
    console.error("[Classification ERROR]", error);
    return { classification: "task", confidence: "low" };
  }
}
