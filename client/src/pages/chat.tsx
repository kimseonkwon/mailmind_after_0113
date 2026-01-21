import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  MessageCircle, 
  Send, 
  Bot, 
  User, 
  Plus,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  FileText,
  Users,
  CheckSquare,
  Bell,
  Reply,
  Copy,
  X,
  Trash2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiChatResponse, Conversation, Message, Email } from "@shared/schema";

interface OllamaStatus {
  connected: boolean;
  baseUrl: string;
}

interface ClassificationStats {
  total: number;
  task: number;
  meeting: number;
  approval: number;
  notice: number;
  unclassified: number;
}

interface DraftReplyResponse {
  draft: string;
  emailId: number;
  originalSubject: string;
}

function ChatMessage({ 
  message, 
  isUser,
  isExpanded,
  onToggle,
  onCopy
}: { 
  message: Message; 
  isUser: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
}) {
  const parseAssistant = (content: string) => {
    const answerMatch = content.match(/답변:\s*-?\s*([\s\S]*?)(?=제목:|발신자:|본문:|날짜:|$)/);
    const subjectMatch = content.match(/제목:\s*-?\s*([\s\S]*?)(?=발신자:|본문:|날짜:|$)/);
    const senderMatch = content.match(/발신자:\s*-?\s*([\s\S]*?)(?=본문:|날짜:|$)/);
    const bodyMatch = content.match(/본문:\s*-?\s*([\s\S]*?)(?=날짜:|$)/);
    const dateMatch = content.match(/날짜:\s*-?\s*(.*)/);
    return {
      answer: (answerMatch?.[1] || content).trim(),
      subject: (subjectMatch?.[1] || "").trim(),
      sender: (senderMatch?.[1] || "").trim(),
      body: (bodyMatch?.[1] || "").trim(),
      date: (dateMatch?.[1] || "").trim(),
    };
  };

  const { answer, subject, sender, body, date } = isUser 
    ? { answer: message.content, subject: "", sender: "", body: "", date: "" } 
    : parseAssistant(message.content);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[80%] rounded-lg p-3 ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"
      }`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm whitespace-pre-wrap flex-1">{answer}</p>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={onCopy}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        {!isUser && (
          <div className="mt-2 space-y-2">
            <Button size="sm" variant="outline" onClick={onToggle}>
              {isExpanded ? "원문 접기" : "관련 메일 원문 보기"}
            </Button>
            {isExpanded && (
              <div className="rounded-md bg-background text-foreground border p-3 space-y-1">
                {subject && <p className="text-xs font-semibold">제목: {subject}</p>}
                {sender && <p className="text-xs text-muted-foreground">발신자: {sender}</p>}
                {body && <p className="text-xs whitespace-pre-wrap leading-relaxed">{body}</p>}
                {date && <p className="text-xs text-muted-foreground">날짜: {date}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [selectedEmailId, setSelectedEmailId] = useState<string>("");
  const [draftReply, setDraftReply] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);

  const { data: ollamaStatus } = useQuery<OllamaStatus>({
    queryKey: ["/api/ollama/status"],
    refetchInterval: 30000,
  });

  const { data: conversations, isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
  });

  const { data: messages, isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/conversations", currentConversationId, "messages"],
    enabled: !!currentConversationId,
  });

  const { data: classificationStats } = useQuery<ClassificationStats>({
    queryKey: ["/api/emails/classification-stats"],
  });

  const { data: emails } = useQuery<Email[]>({
    queryKey: ["/api/emails"],
  });

  const draftMutation = useMutation({
    mutationFn: async (emailId: number) => {
      const response = await apiRequest("POST", "/api/ai/draft-reply", { emailId });
      return response.json() as Promise<DraftReplyResponse>;
    },
    onSuccess: (data) => {
      setDraftReply(data.draft);
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message || "회신 초안 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", {
        message,
        conversationId: currentConversationId || undefined,
      });
      return response.json() as Promise<AiChatResponse>;
    },
    onSuccess: (data) => {
      if (!currentConversationId) {
        setCurrentConversationId(data.conversationId);
      }
      setOptimisticMessage(null);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", data.conversationId, "messages"] });
    },
    onError: (error: Error) => {
      setOptimisticMessage(null);
      toast({
        title: "오류",
        description: error.message || "AI 응답을 가져오는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: number) => {
      const response = await apiRequest("DELETE", `/api/conversations/${conversationId}`);
      return response.json();
    },
    onSuccess: () => {
      if (conversationToDelete === currentConversationId) {
        setCurrentConversationId(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      toast({
        title: "삭제 완료",
        description: "대화가 삭제되었습니다.",
      });
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message || "대화 삭제 중 오류가 발생했습니다.",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setConversationToDelete(null);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    
    const message = input.trim();
    setOptimisticMessage(message);
    setInput("");
    chatMutation.mutate(message);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({
      title: "복사됨",
      description: "메시지가 클립보드에 복사되었습니다.",
    });
  };
  const handleDeleteConversation = (conversationId: number) => {
    setConversationToDelete(conversationId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      deleteConversationMutation.mutate(conversationToDelete);
    }
  };
  const startNewConversation = () => {
    setCurrentConversationId(null);
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
  };

  const handleGenerateDraft = () => {
    if (!selectedEmailId) return;
    setDraftReply("");
    draftMutation.mutate(parseInt(selectedEmailId));
  };

  const handleCopyDraft = () => {
    navigator.clipboard.writeText(draftReply);
    toast({
      title: "복사됨",
      description: "회신 초안이 클립보드에 복사되었습니다.",
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary p-2">
                <MessageCircle className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">AI 비서</h1>
                <p className="text-xs text-muted-foreground">이메일 관리 및 일정 정리 도우미</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowDraftDialog(true)}
                disabled={!ollamaStatus?.connected || !emails?.length}
                data-testid="button-open-draft"
              >
                <Reply className="h-4 w-4 mr-2" />
                회신 초안 생성
              </Button>
              <Badge variant={ollamaStatus?.connected ? "default" : "destructive"} className="gap-1">
                {ollamaStatus?.connected ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    Ollama 연결됨
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    Ollama 연결 안됨
                  </>
                )}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="grid lg:grid-cols-4 gap-6 h-[calc(100vh-180px)]">
          <Card className="lg:col-span-1 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">대화 목록</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={startNewConversation}
                  data-testid="button-new-chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                {convsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : conversations?.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    대화가 없습니다
                  </p>
                ) : (
                  <div className="space-y-1">
                    {conversations?.map(conv => (
                      <ContextMenu key={conv.id}>
                        <ContextMenuTrigger>
                          <Button
                            variant={currentConversationId === conv.id ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-2 px-3"
                            onClick={() => setCurrentConversationId(conv.id)}
                            data-testid={`conversation-${conv.id}`}
                          >
                            <span className="truncate text-sm">{conv.title}</span>
                          </Button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => handleDeleteConversation(conv.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            삭제
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 flex flex-col">
            <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {!currentConversationId && !chatMutation.isPending ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <Bot className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">AI 비서와 대화하세요</h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                      이메일 관리, 일정 정리, 질문 등 무엇이든 물어보세요.
                    </p>
                    {!ollamaStatus?.connected && (
                      <div className="mt-4 flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">Ollama 서버에 연결할 수 없습니다</span>
                      </div>
                    )}
                  </div>
                ) : msgsLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map(i => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <Skeleton className="h-16 flex-1 rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages?.map(msg => (
                      <ChatMessage 
                        key={msg.id} 
                        message={msg} 
                        isUser={msg.role === "user"}
                        isExpanded={expandedMessages.has(msg.id)}
                        onToggle={() => {
                          setExpandedMessages(prev => {
                            const next = new Set(prev);
                            if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
                            return next;
                          });
                        }}
                        onCopy={() => handleCopyMessage(msg.content)}
                      />
                    ))}
                    {optimisticMessage && (
                      <div className="flex gap-3 flex-row-reverse">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="max-w-[80%] rounded-lg p-3 bg-primary text-primary-foreground">
                          <p className="text-sm whitespace-pre-wrap">{optimisticMessage}</p>
                        </div>
                      </div>
                    )}
                    {chatMutation.isPending && (
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="bg-muted rounded-lg p-3">
                          <p className="text-sm text-muted-foreground">생각 중...</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              <div className="p-4 border-t">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    placeholder="메시지를 입력하세요..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={chatMutation.isPending || !ollamaStatus?.connected}
                    data-testid="input-chat"
                  />
                  <Button 
                    type="submit" 
                    size="icon"
                    disabled={!input.trim() || chatMutation.isPending || !ollamaStatus?.connected}
                    data-testid="button-send"
                  >
                    {chatMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={showDraftDialog} onOpenChange={setShowDraftDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5" />
              회신 초안 생성
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="space-y-2">
              <label className="text-sm font-medium">이메일 선택</label>
              <Select value={selectedEmailId} onValueChange={setSelectedEmailId}>
                <SelectTrigger data-testid="select-email">
                  <SelectValue placeholder="회신할 이메일을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {emails?.map(email => (
                    <SelectItem key={email.id} value={email.id.toString()}>
                      {email.subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={handleGenerateDraft}
              disabled={!selectedEmailId || draftMutation.isPending}
              data-testid="button-generate-draft"
            >
              {draftMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Reply className="h-4 w-4 mr-2" />
                  초안 생성
                </>
              )}
            </Button>

            {draftReply && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">생성된 회신 초안</label>
                  <Button variant="ghost" size="sm" onClick={handleCopyDraft} data-testid="button-copy-draft">
                    <Copy className="h-4 w-4 mr-2" />
                    복사
                  </Button>
                </div>
                <ScrollArea className="flex-1 border rounded-lg p-4 bg-muted/30">
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-draft-reply">{draftReply}</p>
                </ScrollArea>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>대화 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 대화를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
