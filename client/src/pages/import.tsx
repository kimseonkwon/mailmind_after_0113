import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Upload, 
  Mail, 
  Database, 
  FileText,
  CheckCircle2,
  Loader2,
  FolderUp,
  Sparkles,
  Calendar,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  Trash2
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import type { Stats } from "@shared/schema";

interface ExtendedImportResult {
  ok: boolean;
  inserted: number;
  classified?: number;
  eventsExtracted?: number;
  embedded?: number;
  message?: string;
}

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

function UploadDropzone({ 
  onUpload, 
  isUploading,
  progress
}: { 
  onUpload: (file: File) => void;
  isUploading: boolean;
  progress: number;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  }, [onUpload]);

  return (
    <Card className="border-dashed">
      <CardContent className="p-8">
        <div
          className={`
            flex flex-col items-center justify-center min-h-[300px] rounded-lg border-2 border-dashed
            transition-colors duration-200 cursor-pointer
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted'}
            ${isUploading ? 'pointer-events-none opacity-70' : ''}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && document.getElementById('file-upload')?.click()}
          data-testid="upload-dropzone"
        >
          <input
            id="file-upload"
            type="file"
            accept=".pst,.json,.eml,.zip"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          
          {isUploading ? (
            <div className="flex flex-col items-center gap-4 w-full max-w-xs">
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <p className="text-lg font-medium">이메일 가져오는 중...</p>
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground">{progress}%</p>
            </div>
          ) : (
            <>
              <Upload className="h-16 w-16 text-muted-foreground mb-6" />
              <p className="text-xl font-medium mb-2">
                파일을 드래그하거나 클릭하세요
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                PST, EML, ZIP(EML폴더), JSON 파일 지원 (최대 1GB)
              </p>
              <div className="flex gap-2">
                <Badge variant="outline">PST</Badge>
                <Badge variant="outline">EML</Badge>
                <Badge variant="outline">ZIP</Badge>
                <Badge variant="outline">JSON</Badge>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ImportResultCard({ result }: { result: ExtendedImportResult }) {
  return (
    <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg mb-2">가져오기 완료</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">이메일: {result.inserted}개</span>
              </div>
              {result.classified !== undefined && result.classified > 0 && (
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">분류: {result.classified}개</span>
                </div>
              )}
              {result.eventsExtracted !== undefined && result.eventsExtracted > 0 && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">일정: {result.eventsExtracted}개</span>
                </div>
              )}
              {result.embedded !== undefined && result.embedded > 0 && (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">임베딩: {result.embedded}개</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ReprocessResult {
  ok: boolean;
  ollamaConnected?: boolean;
  processed: number;
  failed?: number;
  classified: number;
  eventsExtracted: number;
  embedded: number;
  message: string;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastResult, setLastResult] = useState<ExtendedImportResult | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: ollamaStatus } = useQuery<{ connected: boolean; baseUrl: string }>({
    queryKey: ["/api/ollama/status"],
    refetchInterval: 10000,
  });

  const { data: classificationStats } = useQuery<{ total: number; unclassified: number }>({
    queryKey: ["/api/emails/classification-stats"],
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/emails/all");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "데이터 삭제 완료",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/emails/classification-stats"] });
      setShowDeleteConfirm(false);
    },
    onError: (error) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/emails/reprocess");
      return res.json() as Promise<ReprocessResult>;
    },
    onSuccess: (data) => {
      toast({
        title: data.ok ? "재처리 완료" : "일부 처리 실패",
        description: data.message,
        variant: data.ok ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/emails/classification-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ollama/status"] });
    },
    onError: (error) => {
      toast({
        title: "재처리 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      setUploadProgress(10);
      const interval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      try {
        const res = await fetch("/api/import", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        clearInterval(interval);
        setUploadProgress(100);
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        
        return res.json() as Promise<ExtendedImportResult>;
      } catch (error) {
        clearInterval(interval);
        throw error;
      }
    },
    onSuccess: (data) => {
      setLastResult(data);
      toast({
        title: "가져오기 완료",
        description: data.message || `${data.inserted}개의 이메일을 가져왔습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setUploadProgress(0);
    },
    onError: (error) => {
      const errorMsg = error.message;
      const isPstError = errorMsg.includes("PST") || errorMsg.includes("findBtreeItem");
      
      toast({
        title: isPstError ? "PST 파일 파싱 실패" : "가져오기 실패",
        description: errorMsg,
        variant: "destructive",
        duration: isPstError ? 10000 : 5000,
      });
      setUploadProgress(0);
      
      if (isPstError) {
        console.error("PST 파싱 오류 상세:", errorMsg);
      }
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary p-2">
                <FolderUp className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">이메일 가져오기</h1>
                <p className="text-xs text-muted-foreground">PST/JSON 파일에서 이메일 가져오기</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
              {stats && (
                <Badge variant="outline" className="gap-1">
                  <Database className="h-3 w-3" />
                  {stats.emailsCount.toLocaleString()}개 저장됨
                </Badge>
              )}
              {stats && stats.emailsCount > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  전체 삭제
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 mb-8">
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

        {classificationStats && classificationStats.unclassified > 0 && (
          <Alert className="mb-8" variant={ollamaStatus?.connected ? "default" : "destructive"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>미처리 이메일 발견</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                {classificationStats.unclassified}개의 이메일이 아직 AI 처리되지 않았습니다.
                {!ollamaStatus?.connected && " Ollama 서버에 연결해주세요."}
              </span>
              <Button
                size="sm"
                variant={ollamaStatus?.connected ? "default" : "outline"}
                onClick={() => reprocessMutation.mutate()}
                disabled={!ollamaStatus?.connected || reprocessMutation.isPending}
                data-testid="button-reprocess"
              >
                {reprocessMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    재처리
                  </>
                )}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {lastResult && !importMutation.isPending && (
          <div className="mb-8">
            <ImportResultCard result={lastResult} />
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5" />
            파일 업로드
          </h2>
          <UploadDropzone
            onUpload={(file) => importMutation.mutate(file)}
            isUploading={importMutation.isPending}
            progress={uploadProgress}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">자동 처리 기능</CardTitle>
            <CardDescription>
              이메일을 가져올 때 AI 서버(Ollama)가 연결되어 있으면 자동으로 처리됩니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">이메일 분류</p>
                  <p className="text-xs text-muted-foreground">task, meeting, approval, notice</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">일정 추출</p>
                  <p className="text-xs text-muted-foreground">날짜, 시간, 장소 자동 추출</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">벡터 임베딩</p>
                  <p className="text-xs text-muted-foreground">RAG 기반 의미 검색용</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Database className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-sm">데이터 저장</p>
                  <p className="text-xs text-muted-foreground">PostgreSQL 또는 로컬 SQLite</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모든 데이터를 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 모든 이메일, 일정, RAG 데이터가 영구적으로 삭제됩니다.
              {stats && (
                <div className="mt-3 p-3 bg-destructive/10 rounded-md">
                  <p className="text-sm font-medium text-destructive">삭제될 데이터:</p>
                  <ul className="text-sm mt-2 space-y-1">
                    <li>• 이메일: {stats.emailsCount}개</li>
                    <li>• 일정 및 RAG 데이터</li>
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
