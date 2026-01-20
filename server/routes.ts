import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { 
  chatRequestSchema, 
  aiChatRequestSchema,
  eventExtractionRequestSchema,
  type ChatResponse, 
  type ImportResult, 
  type SearchResult,
  type AiChatResponse,
  type EventExtractionResponse
} from "@shared/schema";
import { ZodError } from "zod";
import { generateEmbedding, normalizeQuestionForRag } from "./ollama";

import { chatWithOllama, extractEventsFromEmail, checkOllamaConnection, classifyEmail, generateEmailChunks, getShipbuildingSystemPrompt } from "./ollama";
import { parsePSTFromBuffer } from "./pst-parser";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

function parseEmailsFromJson(content: string): Array<{
  subject: string;
  sender: string;
  date: string;
  body: string;
  importance?: string;
  label?: string;
}> {
  try {
    const data = JSON.parse(content);
    const emails = Array.isArray(data) ? data : (data.emails || []);
    
    return emails.map((email: Record<string, unknown>) => ({
      subject: String(email.subject || email.Subject || ""),
      sender: String(email.sender || email.from || email.From || ""),
      date: String(email.date || email.Date || email.sent_date || ""),
      body: String(email.body || email.content || email.text || email.Body || ""),
      importance: email.importance ? String(email.importance) : undefined,
      label: email.label ? String(email.label) : undefined,
    }));
  } catch {
    return [];
  }
}

function generateSampleEmails(): Array<{
  subject: string;
  sender: string;
  date: string;
  body: string;
}> {
  return [
    {
      subject: "프로젝트 진행 상황 보고",
      sender: "김철수 <kim@example.com>",
      date: "2025-01-05 09:30:00",
      body: "안녕하세요, 프로젝트 진행 상황을 보고드립니다. 현재 1차 개발 단계가 완료되었으며, 다음 주 월요일부터 2차 개발에 착수할 예정입니다. 테스트 일정도 조율 중이오니 참고 부탁드립니다.",
    },
    {
      subject: "회의 일정 안내",
      sender: "박영희 <park@example.com>",
      date: "2025-01-06 14:00:00",
      body: "다음 주 화요일 오후 2시에 정기 회의가 예정되어 있습니다. 회의실 A에서 진행되며, 주요 안건은 분기별 실적 검토와 향후 계획 수립입니다. 참석 여부를 회신해 주세요.",
    },
    {
      subject: "견적서 요청의 건",
      sender: "이민수 <lee@example.com>",
      date: "2025-01-04 11:15:00",
      body: "안녕하세요, 제안서에 언급된 시스템 구축 비용에 대한 상세 견적서를 요청드립니다. 예산 검토를 위해 가능한 빨리 회신 부탁드리며, 항목별 세부 내역도 함께 보내주시면 감사하겠습니다.",
    },
    {
      subject: "서버 점검 공지",
      sender: "시스템관리자 <admin@example.com>",
      date: "2025-01-07 08:00:00",
      body: "금일 오후 10시부터 내일 오전 6시까지 서버 정기 점검이 진행됩니다. 해당 시간 동안 시스템 접속이 불가하오니 양해 부탁드립니다. 중요한 작업은 점검 전 완료해 주시기 바랍니다.",
    },
    {
      subject: "교육 참석 안내",
      sender: "인사팀 <hr@example.com>",
      date: "2025-01-03 16:45:00",
      body: "신규 시스템 사용법 교육이 다음 주 수요일에 진행됩니다. 대상자는 각 부서 담당자이며, 교육 시간은 오전 10시부터 12시까지입니다. 교육장 위치는 본관 3층 대회의실입니다.",
    },
    {
      subject: "계약서 검토 요청",
      sender: "법무팀 <legal@example.com>",
      date: "2025-01-02 10:30:00",
      body: "첨부된 계약서 초안을 검토해 주시기 바랍니다. 수정 사항이나 의견이 있으시면 금주 금요일까지 회신 부탁드립니다. 계약 체결 일정이 촉박하오니 신속한 검토 부탁드립니다.",
    },
    {
      subject: "월간 보고서 제출 안내",
      sender: "경영지원팀 <support@example.com>",
      date: "2025-01-01 09:00:00",
      body: "1월 월간 보고서 제출 마감일은 1월 10일입니다. 각 부서별 실적 및 향후 계획을 포함하여 작성해 주시기 바랍니다. 보고서 양식은 공유 폴더에서 다운로드 가능합니다.",
    },
    {
      subject: "출장 경비 정산 안내",
      sender: "재무팀 <finance@example.com>",
      date: "2025-01-06 13:20:00",
      body: "지난달 출장 경비 정산을 위해 영수증 원본과 정산서를 제출해 주세요. 제출 마감은 이번 주 금요일이며, 지연 시 다음 달로 이월됩니다. 문의사항은 재무팀으로 연락 바랍니다.",
    },
  ];
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  app.post("/api/import", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      let emailsToImport: Array<{
        subject: string;
        sender: string;
        date: string;
        body: string;
        importance?: string;
        label?: string;
      }> = [];
      let filename = "sample_data";

      if (file) {
        filename = file.originalname;
        const ext = filename.toLowerCase().split(".").pop();

        if (ext === "json") {
          const content = file.buffer.toString("utf-8");
          emailsToImport = parseEmailsFromJson(content);
        } else if (ext === "pst") {
          const parseResult = parsePSTFromBuffer(file.buffer, filename);
          if (parseResult.errors.length > 0 && parseResult.emails.length === 0) {
            res.status(400).json({
              ok: false,
              inserted: 0,
              message: `PST 파일 파싱 오류: ${parseResult.errors.join(", ")}`,
            });
            return;
          }
          emailsToImport = parseResult.emails;
        } else if (ext === "mbox") {
          res.status(400).json({
            ok: false,
            inserted: 0,
            message: "MBOX 파일은 현재 지원되지 않습니다. PST 또는 JSON 형식을 사용해 주세요.",
          });
          return;
        } else {
          res.status(400).json({
            ok: false,
            inserted: 0,
            message: "지원되지 않는 파일 형식입니다. JSON 파일을 사용해 주세요.",
          });
          return;
        }
      } else {
        emailsToImport = generateSampleEmails();
        filename = "sample_demo_data";
      }

      if (emailsToImport.length === 0) {
        res.status(400).json({
          ok: false,
          inserted: 0,
          message: "파일에서 이메일을 찾을 수 없습니다.",
        });
        return;
      }

      const insertedEmails = await storage.insertEmailsAndGetIds(emailsToImport);
      const insertedCount = insertedEmails.length;
      
      await storage.logImport({
        filename,
        emailsImported: insertedCount,
      });

      let classifiedCount = 0;
      let eventsExtractedCount = 0;
      let embeddedCount = 0;

      const ollamaConnected = await checkOllamaConnection();
      
      if (ollamaConnected) {
        for (const email of insertedEmails) {
          try {
            const classification = await classifyEmail(email.subject, email.body, email.sender);
            await storage.updateEmailClassification(email.id, classification.classification, classification.confidence);
            classifiedCount++;

            const events = await extractEventsFromEmail(email.subject, email.body, email.date);
            for (const event of events) {
              if (!event.title || !event.startDate) {
                console.log(`Skipping invalid event for email ${email.id}: missing title or startDate`);
                continue;
              }
              try {
                await storage.addCalendarEvent({
                  emailId: email.id,
                  title: event.title,
                  startDate: event.startDate,
                  endDate: event.endDate || null,
                  location: event.location || null,
                  description: event.description || null,
                });
                eventsExtractedCount++;
              } catch (eventErr) {
                console.error(`Failed to add calendar event for email ${email.id}:`, eventErr);
              }
            }

            const emailChunks = await generateEmailChunks(
              email.id, 
              email.subject, 
              email.sender, 
              email.date, 
              email.body
            );
            
            if (emailChunks.length > 0) {
              const chunksToSave = emailChunks.map((chunk, idx) => ({
                emailId: email.id,
                chunkIndex: idx,
                content: chunk.content,
                embedding: JSON.stringify(chunk.embedding),
              }));
              await storage.saveRagChunks(chunksToSave);
              embeddedCount += emailChunks.length;
            }

            await storage.markEmailProcessed(email.id);
          } catch (err) {
            console.error(`Error processing email ${email.id}:`, err);
          }
        }
      }

      const result = {
        ok: true,
        inserted: insertedCount,
        classified: classifiedCount,
        eventsExtracted: eventsExtractedCount,
        embedded: embeddedCount,
        message: ollamaConnected 
          ? `${insertedCount}개의 이메일을 가져왔습니다. ${classifiedCount}개 분류, ${eventsExtractedCount}개 일정 추출, ${embeddedCount}개 벡터 임베딩 완료.`
          : `${insertedCount}개의 이메일을 가져왔습니다. AI 서버 미연결로 자동 처리가 건너뛰어졌습니다.`,
      };

      res.json(result);
    } catch (error) {
      console.error("Import error:", error);
      res.status(500).json({
        ok: false,
        inserted: 0,
        message: error instanceof Error ? error.message : "가져오기 중 오류가 발생했습니다.",
      });
    }
  });

  app.post("/api/search", async (req: Request, res: Response) => {
    try {
      const validationResult = chatRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => e.message).join(", ");
        res.status(400).json({ error: errors || "잘못된 요청입니다." });
        return;
      }

      const { message, topK } = validationResult.data;
      const citations: SearchResult[] = await storage.searchEmails(message.trim(), topK);

      const topSubjects = citations
        .slice(0, 10)
        .map(c => `- ${c.subject} (점수=${c.score.toFixed(1)}, ID=${c.mailId})`)
        .join("\n");

      const answer = `검색어: ${message}\n\nTop 결과:\n${topSubjects || "- (결과 없음)"}`;

      const response: ChatResponse = {
        answer,
        citations,
        debug: {
          topK,
          hitsCount: citations.length,
        },
      };

      res.json(response);
    } catch (error) {
      console.error("Search error:", error);
      if (error instanceof ZodError) {
        res.status(400).json({ error: "잘못된 요청 형식입니다." });
        return;
      }
      res.status(500).json({ error: "검색 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/ping", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      hint: "POST /api/import로 이메일 가져오기, /api/stats로 통계 확인, POST /api/search로 검색",
    });
  });

  app.get("/api/ollama/status", async (_req: Request, res: Response) => {
    try {
      const connected = await checkOllamaConnection();
      res.json({ connected, baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434" });
    } catch {
      res.json({ connected: false, baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434" });
    }
  });

  app.get("/api/conversations", async (_req: Request, res: Response) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Get conversations error:", error);
      res.status(500).json({ error: "대화 목록을 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      if (isNaN(conversationId)) {
        res.status(400).json({ error: "잘못된 대화 ID입니다." });
        return;
      }
      const messages = await storage.getMessages(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "메시지를 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/ai/chat", async (req: Request, res: Response) => {
  try {
    const validationResult = aiChatRequestSchema.safeParse(req.body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => e.message).join(", ");
      return res.status(400).json({ error: errors || "잘못된 요청입니다." });
    }

    const { message, conversationId } = validationResult.data;

    /* =====================================================
       0. 대화 ID 처리
       ===================================================== */
    let convId = conversationId;
    if (!convId) {
      const newConv = await storage.createConversation({
        title: message.slice(0, 50),
      });
      convId = newConv.id;
    }

    await storage.addMessage({
      conversationId: convId,
      role: "user",
      content: message,
    });

    /* =====================================================
       1. 질문 정규화
       ===================================================== */
    const { queryForRetrieval, queryForLLM } =
      await normalizeQuestionForRag(message);

    const retrievalQuery = queryForRetrieval || message;
    const llmQuestion = queryForLLM || message;

    // 검색어 토큰 (길이 2 이상) 추출: 벡터 결과가 질문 토큰을 전혀 포함하지 않는 경우 필터링
    const queryTokens = Array.from(
      new Set(
        (retrievalQuery || "")
          .split(/[^0-9A-Za-z가-힣-]+/)
          .map(t => t.trim())
          .filter(t => t.length >= 2)
      )
    );

    /* =====================================================
       ⭐ 1.5 일정/언제 질문 → events DB 우선 처리 (핵심)
       ===================================================== */
    const isScheduleQuestion = /언제|일정|날짜|시간/.test(message);

    if (isScheduleQuestion) {
      const events = await storage.searchEventsByKeyword(retrievalQuery);

      if (events.length > 0) {
        const answer = events
          .slice(0, 3)
          .map(e => {
            const start = e.startDate;
            const end = e.endDate ? ` ~ ${e.endDate}` : "";
            return `- ${e.title}: ${start}${end}`;
          })
          .join("\n");

        await storage.addMessage({
          conversationId: convId,
          role: "assistant",
          content: answer,
        });

        return res.json({
          response: answer,
          conversationId: convId,
        });
      }
      // events가 없으면 → 아래 RAG로 fallback
    }

    /* =====================================================
       2. RAG 검색 (벡터 우선)
       ===================================================== */
    let emailContext = "";
    let bestHit: { body: string; date: string; subject?: string; sender?: string } | null = null;
    const vectorResults: Array<{ content: string; similarity: number }> = [];
    const bm25Results: Array<{
      subject: string;
      sender: string;
      date: string;
      body: string;
      score: number;
    }> = [];

    const VECTOR_MIN_SIM = 0.50;
    let maxSimilarity = 0;

    const ragChunkCount = await storage.getRagChunkCount();
    let firstAboveThreshold: { content: string; similarity: number } | null = null;
    if (ragChunkCount > 0) {
      const queryEmbedding = await generateEmbedding(retrievalQuery);
      if (queryEmbedding) {
        const relevantChunks = await storage.searchRagChunks(queryEmbedding, 3);
        for (const r of relevantChunks) {
          maxSimilarity = Math.max(maxSimilarity, r.similarity);
          if (r.similarity >= VECTOR_MIN_SIM) {
            const content = r.chunk.content;
            const hasTokenMatch =
              queryTokens.length === 0 || queryTokens.some(t => content.includes(t));

            // 질문 토큰이 전혀 없으면서 유사도도 낮으면 제외 (엔진→용접 오매칭 방지)
            if (!hasTokenMatch && r.similarity < 0.75) continue;

            vectorResults.push({
              content,
              similarity: r.similarity,
            });

            if (!bestHit) {
              const dateMatch = content.match(/날짜:\s*([^\n]+)/);
              const subjectMatch = content.match(/제목:\s*([^\n]+)/);
              const senderMatch = content.match(/발신자:\s*([^\n]+)/);
              const bodyPart = content.split("[원문 일부]")[1]?.trim() || "";
              bestHit = {
                body: (bodyPart || content).slice(0, 400),
                date: dateMatch ? dateMatch[1].trim() : "",
                subject: subjectMatch ? subjectMatch[1].trim() : "",
                sender: senderMatch ? senderMatch[1].trim() : "",
              };
            }
          } else if (!firstAboveThreshold && r.similarity >= VECTOR_MIN_SIM) {
            firstAboveThreshold = {
              content: r.chunk.content,
              similarity: r.similarity,
            };
          }
        }
      }
    }

    // 토큰 불일치로 모두 걸러졌지만 유사도는 기준을 넘는 경우 첫 결과라도 사용
    if (vectorResults.length === 0 && firstAboveThreshold) {
      vectorResults.push(firstAboveThreshold);
      const content = firstAboveThreshold.content;
      const dateMatch = content.match(/날짜:\s*([^\n]+)/);
      const subjectMatch = content.match(/제목:\s*([^\n]+)/);
      const senderMatch = content.match(/발신자:\s*([^\n]+)/);
      const bodyPart = content.split("[원문 일부]")[1]?.trim() || "";
      bestHit = {
        body: (bodyPart || content).slice(0, 400),
        date: dateMatch ? dateMatch[1].trim() : "",
        subject: subjectMatch ? subjectMatch[1].trim() : "",
        sender: senderMatch ? senderMatch[1].trim() : "",
      };
    }

    /* =====================================================
       3. 벡터 결과 없거나 약하면 → BM25 검색
       ===================================================== */
    const needBm25 =
      vectorResults.length === 0 || maxSimilarity < VECTOR_MIN_SIM;

    if (needBm25) {
      const bm25Emails = await storage.searchEmailsBm25(retrievalQuery, 6);
      for (const e of bm25Emails) {
        bm25Results.push({
          subject: e.subject,
          sender: e.sender || "",
          date: e.date || "",
          body: e.body,
          score: e.score,
        });

        if (!bestHit) {
          bestHit = {
            body: (e.body || "").slice(0, 400),
            date: e.date || "",
            subject: e.subject || "",
            sender: e.sender || "",
          };
        }
      }
    }

    /* =====================================================
       4. Context 병합 (최대 3개만)
       ===================================================== */
    const seen = new Set<string>();
    const contextItems: string[] = [];

    for (const v of vectorResults) {
      if (contextItems.length >= 3) break;
      const key = v.content.slice(0, 120);
      if (!seen.has(key)) {
        seen.add(key);
        contextItems.push(
          `[벡터 검색 · 유사도 ${(v.similarity * 100).toFixed(0)}%]
${v.content}`
        );
      }
    }

    for (const k of bm25Results) {
      if (contextItems.length >= 3) break;
      const key = k.subject + k.sender;
      if (!seen.has(key)) {
        seen.add(key);
        contextItems.push(
          `[키워드 검색 · BM25 점수 ${k.score.toFixed(2)}]
제목: ${k.subject}
발신자: ${k.sender}
날짜: ${k.date}

${k.body.slice(0, 400)}`
        );
      }
    }

    if (contextItems.length > 0) {
      emailContext = contextItems.join("\n\n---\n\n");
    }

    /* =====================================================
       🧪 RAG DEBUG 로그
       ===================================================== */
    console.log("[RAG DEBUG] retrievalQuery:", retrievalQuery);
    console.log(
      "[RAG DEBUG] vectorResults:",
      vectorResults.length,
      "maxSim:",
      maxSimilarity,
      "tokens:",
      queryTokens
    );
    console.log("[RAG DEBUG] bm25Results:", bm25Results.length);
    console.log("[RAG DEBUG] emailContextLen:", emailContext?.length || 0);

    /* =====================================================
       4.5 RAG 실패 시 LLM 호출 차단
       ===================================================== */
    if (!emailContext || emailContext.trim().length === 0) {
      const noDataResponse =
        "해당 질문과 관련된 이메일을 찾지 못했습니다.";

      await storage.addMessage({
        conversationId: convId,
        role: "assistant",
        content: noDataResponse,
      });

      return res.json({
        response: noDataResponse,
        conversationId: convId,
      });
    }

    /* =====================================================
       6. LLM 호출 (히스토리 ❌)
       ===================================================== */
    const systemPrompt = getShipbuildingSystemPrompt(emailContext);

    const aiResponse = await chatWithOllama([
      { role: "system", content: systemPrompt },
      { role: "user", content: llmQuestion },
    ]);

    const koreanOnly = aiResponse
      .replace(/[^가-힣0-9.,!?'"()\-:\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const notFound = /(찾지 못했습니다|관련된 이메일을 찾지 못했습니다)/.test(
      koreanOnly
    );

    const answerText = !emailContext || notFound
      ? (bestHit?.body
          ? `관련 이메일을 확인했습니다. 핵심 내용은 다음과 같습니다: ${bestHit.body.replace(/\s+/g, " ")}`
          : "관련 답변을 찾지 못했습니다")
      : `확인했습니다. ${koreanOnly}`;

    const formattedResponse = `답변:\n- ${answerText}\n제목:\n- ${bestHit?.subject || "정보 없음"}\n발신자:\n- ${bestHit?.sender || "정보 없음"}\n본문:\n- ${bestHit?.body?.replace(/\s+/g, " ") || "정보 없음"}\n날짜:\n- ${bestHit?.date || "정보 없음"}`;

    await storage.addMessage({
      conversationId: convId,
      role: "assistant",
      content: formattedResponse,
    });

    /* =====================================================
       7. 응답
       ===================================================== */
    return res.json({
      response: formattedResponse,
      conversationId: convId,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "AI 채팅 중 오류가 발생했습니다.",
    });
  }
});





  app.post("/api/ai/draft-reply", async (req: Request, res: Response) => {
    try {
      const { emailId } = req.body;
      
      if (!emailId) {
        res.status(400).json({ error: "이메일 ID가 필요합니다." });
        return;
      }

      const email = await storage.getEmailById(emailId);
      if (!email) {
        res.status(404).json({ error: "이메일을 찾을 수 없습니다." });
        return;
      }

      const prompt = `다음 이메일에 대한 전문적인 회신 초안을 작성해주세요.

원본 이메일:
제목: ${email.subject}
발신자: ${email.sender || "알 수 없음"}
날짜: ${email.date || "알 수 없음"}
내용:
${email.body}

요구사항:
1. 조선소 업무에 적합한 전문적이고 정중한 어조 사용
2. 원본 이메일의 요청사항이나 질문에 명확히 답변
3. 필요한 경우 확인 사항이나 추가 정보 요청 포함
4. 한국어로 작성

회신 초안:`;

      const draftReply = await chatWithOllama([
        { role: "system", content: "당신은 조선소 업무 이메일 회신을 전문적으로 작성하는 AI 비서입니다. 정중하고 명확한 비즈니스 이메일을 작성합니다." },
        { role: "user", content: prompt },
      ]);

      res.json({ 
        draft: draftReply,
        emailId,
        originalSubject: email.subject,
      });
    } catch (error) {
      console.error("Draft reply error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "회신 초안 생성 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/emails/classification-stats", async (_req: Request, res: Response) => {
    try {
      const emails = await storage.getAllEmails(100000);
      const stats = {
        total: emails.length,
        task: 0,
        meeting: 0,
        approval: 0,
        notice: 0,
        unclassified: 0,
      };

      for (const email of emails) {
        if (email.classification === "task") stats.task++;
        else if (email.classification === "meeting") stats.meeting++;
        else if (email.classification === "approval") stats.approval++;
        else if (email.classification === "notice") stats.notice++;
        else stats.unclassified++;
      }

      res.json(stats);
    } catch (error) {
      console.error("Classification stats error:", error);
      res.status(500).json({ error: "분류 통계를 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/emails/reprocess", async (_req: Request, res: Response) => {
    try {
      const ollamaConnected = await checkOllamaConnection();
      if (!ollamaConnected) {
        res.status(503).json({ 
          error: "Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인해주세요.",
          ollamaConnected: false 
        });
        return;
      }

      const emails = await storage.getAllEmails(100000);
      const unprocessedEmails = emails.filter(e => !e.classification || !e.isProcessed);
      
      if (unprocessedEmails.length === 0) {
        res.json({ 
          ok: true,
          processed: 0,
          classified: 0,
          eventsExtracted: 0,
          embedded: 0,
          message: "처리할 이메일이 없습니다. 모든 이메일이 이미 처리되었습니다."
        });
        return;
      }

      let classifiedCount = 0;
      let eventsExtractedCount = 0;
      let embeddedCount = 0;
      let successCount = 0;
      let failedCount = 0;

      for (const email of unprocessedEmails) {
        try {
          if (!email.classification) {
            const classification = await classifyEmail(email.subject, email.body, email.sender);
            await storage.updateEmailClassification(email.id, classification.classification, classification.confidence);
            classifiedCount++;
          }

          const existingEvents = await storage.getCalendarEventsByEmailId(email.id);
          if (existingEvents.length === 0) {
            const events = await extractEventsFromEmail(email.subject, email.body, email.date);
            for (const event of events) {
              if (!event.title || !event.startDate) {
                console.log(`Skipping invalid event for email ${email.id}: missing title or startDate`);
                continue;
              }
              try {
                await storage.addCalendarEvent({
                  emailId: email.id,
                  title: event.title,
                  startDate: event.startDate,
                  endDate: event.endDate || null,
                  location: event.location || null,
                  description: event.description || null,
                });
                eventsExtractedCount++;
              } catch (eventErr) {
                console.error(`Failed to add calendar event for email ${email.id}:`, eventErr);
              }
            }
          }

          const existingChunks = await storage.getRagChunksByEmailId(email.id);
          if (existingChunks.length === 0) {
            const emailChunks = await generateEmailChunks(
              email.id, 
              email.subject, 
              email.sender, 
              email.date, 
              email.body
            );
            
            if (emailChunks.length > 0) {
              const chunksToSave = emailChunks.map((chunk, idx) => ({
                emailId: email.id,
                chunkIndex: idx,
                content: chunk.content,
                embedding: JSON.stringify(chunk.embedding),
              }));
              await storage.saveRagChunks(chunksToSave);
              embeddedCount += emailChunks.length;
            }
          }

          await storage.markEmailProcessed(email.id);
          successCount++;
        } catch (err) {
          console.error(`Error reprocessing email ${email.id}:`, err);
          failedCount++;
        }
      }

      const message = failedCount > 0
        ? `${successCount}개 이메일 처리 완료, ${failedCount}개 실패. 분류: ${classifiedCount}개, 일정: ${eventsExtractedCount}개, 임베딩: ${embeddedCount}개 청크`
        : `${successCount}개 이메일 재처리 완료. 분류: ${classifiedCount}개, 일정: ${eventsExtractedCount}개, 임베딩: ${embeddedCount}개 청크`;

      res.json({ 
        ok: failedCount === 0,
        ollamaConnected: true,
        processed: successCount,
        failed: failedCount,
        classified: classifiedCount,
        eventsExtracted: eventsExtractedCount,
        embedded: embeddedCount,
        message
      });
    } catch (error) {
      console.error("Reprocess error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "재처리 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/events/extract", async (req: Request, res: Response) => {
    try {
      const validationResult = eventExtractionRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => e.message).join(", ");
        res.status(400).json({ error: errors || "잘못된 요청입니다." });
        return;
      }

      const { emailId } = validationResult.data;
      const email = await storage.getEmailById(emailId);
      
      if (!email) {
        res.status(404).json({ error: "이메일을 찾을 수 없습니다." });
        return;
      }

      const extractedEvents = await extractEventsFromEmail(
        email.subject,
        email.body,
        email.date
      );

      for (const event of extractedEvents) {
        await storage.addCalendarEvent({
          emailId: email.id,
          title: event.title,
          startDate: event.startDate,
          endDate: event.endDate || null,
          location: event.location || null,
          description: event.description || null,
        });
      }

      const response: EventExtractionResponse = {
        events: extractedEvents,
        emailId,
      };

      res.json(response);
    } catch (error) {
      console.error("Event extraction error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "일정 추출 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/events", async (_req: Request, res: Response) => {
    try {
      const events = await storage.getCalendarEvents();
      res.json(events);
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "일정을 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/emails", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const classification = req.query.classification as string | undefined;
      
      let allEmails = await storage.getAllEmails(limit);
      
      if (classification && classification !== "all") {
        allEmails = allEmails.filter(e => e.classification === classification);
      }
      
      res.json(allEmails);
    } catch (error) {
      console.error("Get emails error:", error);
      res.status(500).json({ error: "이메일 목록을 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/emails/:id/classify", async (req: Request, res: Response) => {
    try {
      const emailId = parseInt(req.params.id);
      if (isNaN(emailId)) {
        res.status(400).json({ error: "잘못된 이메일 ID입니다." });
        return;
      }

      const email = await storage.getEmailById(emailId);
      if (!email) {
        res.status(404).json({ error: "이메일을 찾을 수 없습니다." });
        return;
      }

      const classification = await classifyEmail(email.subject, email.body, email.sender);
      await storage.updateEmailClassification(emailId, classification.classification, classification.confidence);

      res.json({ 
        success: true, 
        classification: classification.classification,
        confidence: classification.confidence 
      });
    } catch (error) {
      console.error("Classification error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "분류 중 오류가 발생했습니다." });
    }
  });

  app.get("/api/settings/storage", async (_req: Request, res: Response) => {
    try {
      const savedSettings = await storage.getAppSetting("storage_config");
      let config = { mode: "postgresql", dataDir: "" };
      
      if (savedSettings) {
        try {
          config = JSON.parse(savedSettings);
        } catch {}
      }
      
      const currentMode = process.env.STORAGE_MODE || "postgresql";
      const currentDataDir = process.env.DATA_DIR || "";
      
      res.json({ 
        mode: currentMode,
        dataDir: currentDataDir,
        savedMode: config.mode,
        savedDataDir: config.dataDir,
        info: currentMode === "local" && currentDataDir 
          ? `로컬 저장소 사용 중 (${currentDataDir})` 
          : "PostgreSQL 데이터베이스 사용 중",
        needsRestart: config.mode !== currentMode || config.dataDir !== currentDataDir
      });
    } catch (error) {
      console.error("Get storage settings error:", error);
      res.status(500).json({ error: "설정을 가져오는 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/settings/storage", async (req: Request, res: Response) => {
    try {
      const { mode, dataDir } = req.body;
      
      if (!mode || (mode !== "local" && mode !== "postgresql")) {
        res.status(400).json({ error: "유효하지 않은 저장소 모드입니다." });
        return;
      }
      
      if (mode === "local" && !dataDir) {
        res.status(400).json({ error: "로컬 모드에는 데이터 폴더 경로가 필요합니다." });
        return;
      }

      const config = JSON.stringify({ mode, dataDir: dataDir || "" });
      await storage.setAppSetting("storage_config", config);
      
      res.json({ 
        success: true, 
        message: "설정이 저장되었습니다. 변경 사항을 적용하려면 애플리케이션을 재시작하세요.",
        savedMode: mode,
        savedDataDir: dataDir
      });
    } catch (error) {
      console.error("Save storage settings error:", error);
      res.status(500).json({ error: "설정 저장 중 오류가 발생했습니다." });
    }
  });

  app.post("/api/process/unprocessed", async (_req: Request, res: Response) => {
    try {
      const ollamaConnected = await checkOllamaConnection();
      if (!ollamaConnected) {
        res.status(503).json({ error: "AI 서버에 연결할 수 없습니다." });
        return;
      }

      const unprocessed = await storage.getUnprocessedEmails();
      let processedCount = 0;
      let eventsCount = 0;

      for (const email of unprocessed) {
        try {
          const classification = await classifyEmail(email.subject, email.body, email.sender);
          await storage.updateEmailClassification(email.id, classification.classification, classification.confidence);

          const events = await extractEventsFromEmail(email.subject, email.body, email.date);
          for (const event of events) {
            if (!event.title || !event.startDate) {
              console.log(`Skipping invalid event for email ${email.id}: missing title or startDate`);
              continue;
            }
            try {
              await storage.addCalendarEvent({
                emailId: email.id,
                title: event.title,
                startDate: event.startDate,
                endDate: event.endDate || null,
                location: event.location || null,
                description: event.description || null,
              });
              eventsCount++;
            } catch (eventErr) {
              console.error(`Failed to add calendar event for email ${email.id}:`, eventErr);
            }
          }

          await storage.markEmailProcessed(email.id);
          processedCount++;
        } catch (err) {
          console.error(`Error processing email ${email.id}:`, err);
        }
      }

      res.json({
        success: true,
        processed: processedCount,
        eventsExtracted: eventsCount,
        message: `${processedCount}개 이메일 처리 완료, ${eventsCount}개 일정 추출`
      });
    } catch (error) {
      console.error("Process unprocessed error:", error);
      res.status(500).json({ error: "처리 중 오류가 발생했습니다." });
    }
  });

  return httpServer;
}
