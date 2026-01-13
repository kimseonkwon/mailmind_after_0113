import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Search, 
  Mail, 
  Database, 
  Clock, 
  User, 
  FileText,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles
} from "lucide-react";
import type { Stats, ChatResponse, SearchResult, EventExtractionResponse } from "@shared/schema";

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon,
  loading 
}: { 
  title: string; 
  value: string | number; 
  description?: string;
  icon: typeof Mail;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>
            {value}
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmailResultCard({ 
  result, 
  index,
  expanded,
  onToggle,
  onExtract,
  isExtracting
}: { 
  result: SearchResult; 
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onExtract: (emailId: number) => void;
  isExtracting: boolean;
}) {
  return (
    <Card 
      className="hover-elevate cursor-pointer transition-shadow duration-200"
      onClick={onToggle}
      data-testid={`email-result-${index}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate" data-testid={`email-subject-${index}`}>
                {result.subject || "(제목 없음)"}
              </h3>
              <Badge variant="secondary" className="text-xs shrink-0">
                점수: {result.score.toFixed(1)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
              {result.sender && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{result.sender}</span>
                </span>
              )}
              {result.date && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{result.date}</span>
                </span>
              )}
            </div>
            {!expanded && result.body && (
              <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                {result.body}
              </p>
            )}
            {expanded && result.body && (
              <div className="mt-4 p-4 bg-muted rounded-md">
                <p className="text-sm whitespace-pre-wrap">{result.body}</p>
              </div>
            )}
            {expanded && (
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExtract(parseInt(result.mailId));
                  }}
                  disabled={isExtracting}
                  data-testid={`extract-events-${index}`}
                >
                  {isExtracting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1" />
                  )}
                  일정 추출
                </Button>
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            data-testid={`toggle-email-${index}`}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ 
  icon: Icon, 
  title, 
  description 
}: { 
  icon: typeof Mail; 
  title: string; 
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );
}

export default function Home() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [topK, setTopK] = useState(10);
  const [expandedEmails, setExpandedEmails] = useState<Set<number>>(new Set());
  const [searchResults, setSearchResults] = useState<ChatResponse | null>(null);
  const [extractingEmails, setExtractingEmails] = useState<Set<number>>(new Set());

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const extractMutation = useMutation({
    mutationFn: async (emailId: number) => {
      setExtractingEmails(prev => new Set(prev).add(emailId));
      const res = await apiRequest("POST", "/api/events/extract", { emailId });
      return res.json() as Promise<EventExtractionResponse>;
    },
    onSuccess: (data) => {
      setExtractingEmails(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.emailId);
        return newSet;
      });
      if (data.events.length > 0) {
        toast({
          title: "일정 추출 완료",
          description: `${data.events.length}개의 일정을 추출했습니다.`,
        });
      } else {
        toast({
          title: "일정 없음",
          description: "이 이메일에서 일정을 찾을 수 없습니다.",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    },
    onError: (error: Error, emailId: number) => {
      setExtractingEmails(prev => {
        const newSet = new Set(prev);
        newSet.delete(emailId);
        return newSet;
      });
      toast({
        title: "일정 추출 실패",
        description: error.message || "일정을 추출하는 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    },
  });

  const searchMutation = useMutation({
    mutationFn: async (data: { message: string; topK: number }) => {
      const res = await apiRequest("POST", "/api/search", data);
      return res.json() as Promise<ChatResponse>;
    },
    onSuccess: (data) => {
      setSearchResults(data);
      setExpandedEmails(new Set());
    },
    onError: (error) => {
      toast({
        title: "검색 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      toast({
        title: "검색어를 입력해주세요",
        variant: "destructive",
      });
      return;
    }
    searchMutation.mutate({ message: searchQuery, topK });
  };

  const toggleEmailExpand = (index: number) => {
    setExpandedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setExpandedEmails(new Set());
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary p-2">
                <Mail className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">이메일 검색</h1>
                <p className="text-xs text-muted-foreground">PST/JSON 이메일 검색 도구</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {stats && (
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  {stats.emailsCount.toLocaleString()}개
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardContent className="p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="검색어를 입력하세요..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-10 h-12 text-lg"
                  data-testid="input-search"
                />
                {searchQuery && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={clearSearch}
                    data-testid="button-clear-search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="topK" className="text-sm text-muted-foreground whitespace-nowrap">
                    결과 수:
                  </label>
                  <Input
                    id="topK"
                    type="number"
                    min={1}
                    max={50}
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value) || 10)}
                    className="w-20"
                    data-testid="input-topk"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={searchMutation.isPending || !searchQuery.trim()}
                  data-testid="button-search"
                >
                  {searchMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      검색 중...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      검색
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <StatCard
            title="총 이메일"
            value={stats?.emailsCount.toLocaleString() ?? "0"}
            description="저장된 이메일 수"
            icon={Mail}
            loading={statsLoading}
          />
          <StatCard
            title="저장소 상태"
            value={stats?.mode ?? "확인 중..."}
            description="현재 저장 모드"
            icon={Database}
            loading={statsLoading}
          />
        </div>

        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              검색 결과
            </h2>
            {searchResults && (
              <Badge variant="outline" data-testid="results-count">
                {searchResults.citations.length}개 결과
              </Badge>
            )}
          </div>

          {searchMutation.isPending ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-3/4 mb-2" />
                    <Skeleton className="h-4 w-1/2 mb-4" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : searchResults ? (
            searchResults.citations.length > 0 ? (
              <div className="space-y-4" data-testid="search-results">
                {searchResults.citations.map((result, index) => (
                  <EmailResultCard
                    key={`${result.mailId}-${index}`}
                    result={result}
                    index={index}
                    expanded={expandedEmails.has(index)}
                    onToggle={() => toggleEmailExpand(index)}
                    onExtract={(emailId) => extractMutation.mutate(emailId)}
                    isExtracting={extractingEmails.has(parseInt(result.mailId))}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={AlertCircle}
                title="검색 결과가 없습니다"
                description="다른 검색어로 다시 시도해보세요."
              />
            )
          ) : (
            <EmptyState
              icon={Search}
              title="이메일을 검색해보세요"
              description="검색어를 입력하면 저장된 이메일에서 관련 내용을 찾아드립니다."
            />
          )}
        </section>
      </main>

      <footer className="border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            PST 이메일 검색 도구 - 학생 과제 프로젝트
          </p>
        </div>
      </footer>
    </div>
  );
}
