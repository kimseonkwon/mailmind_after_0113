import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckSquare, Users, FileText, Bell, AlertCircle, X, Download, Eye, ExternalLink } from "lucide-react";
import type { ClassificationStats, Email } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClassificationStats {
  total: number;
  task: number;
  meeting: number;
  approval: number;
  notice: number;
  unclassified: number;
}

type ClassificationType = "all" | "task" | "meeting" | "approval" | "notice" | "unclassified";

export default function EmailsPage() {
  const [selectedCategory, setSelectedCategory] = useState<ClassificationType>("all");
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<{ name: string; path: string } | null>(null);

  const { data: classificationStats } = useQuery<ClassificationStats>({
    queryKey: ["/api/emails/classification-stats"],
  });

  const { data: emails, isLoading: emailsLoading } = useQuery<Email[]>({
    queryKey: ["/api/emails", selectedCategory],
    queryFn: async () => {
      const url = selectedCategory === "all" 
        ? "/api/emails" 
        : `/api/emails?classification=${selectedCategory}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch emails");
      return response.json();
    },
  });

  const selectedEmail = emails?.find(e => e.id === selectedEmailId);

  const filteredEmails = emails || [];
  const categoryLabels = {
    all: "전체",
    task: "업무",
    meeting: "회의",
    approval: "결재",
    notice: "공지",
    unclassified: "미분류",
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">이메일 분류</h1>
              <p className="text-xs text-muted-foreground">받은 이메일 분류 현황</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>이메일 분류 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {classificationStats && classificationStats.total > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
                <Button
                  variant={selectedCategory === "all" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <span className="text-sm font-semibold">{categoryLabels.all}</span>
                  <span className="text-sm">{classificationStats.total}</span>
                </Button>
                <Button
                  variant={selectedCategory === "task" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("task");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold">{categoryLabels.task}</span>
                  <span className="text-sm">{classificationStats.task}</span>
                </Button>
                <Button
                  variant={selectedCategory === "meeting" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("meeting");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <Users className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-semibold">{categoryLabels.meeting}</span>
                  <span className="text-sm">{classificationStats.meeting}</span>
                </Button>
                <Button
                  variant={selectedCategory === "approval" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("approval");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <FileText className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-semibold">{categoryLabels.approval}</span>
                  <span className="text-sm">{classificationStats.approval}</span>
                </Button>
                <Button
                  variant={selectedCategory === "notice" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("notice");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <Bell className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-semibold">{categoryLabels.notice}</span>
                  <span className="text-sm">{classificationStats.notice}</span>
                </Button>
                <Button
                  variant={selectedCategory === "unclassified" ? "default" : "outline"}
                  onClick={() => {
                    setSelectedCategory("unclassified");
                    setSelectedEmailId(null);
                  }}
                  className="flex items-center justify-center gap-2"
                >
                  <AlertCircle className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-semibold">{categoryLabels.unclassified}</span>
                  <span className="text-sm">{classificationStats.unclassified}</span>
                </Button>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">분류된 이메일이 없습니다</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{categoryLabels[selectedCategory]} 이메일 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {emailsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredEmails.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">{categoryLabels[selectedCategory]} 이메일이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEmails.map(email => (
                  <div key={email.id}>
                    <div
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedEmailId === email.id
                          ? 'bg-muted border-primary'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedEmailId(selectedEmailId === email.id ? null : email.id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{email.subject || "제목 없음"}</p>
                          <p className="text-xs text-muted-foreground mt-1">{email.sender || "-"}</p>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">{email.date || "-"}</p>
                      </div>
                    </div>

                    {selectedEmailId === email.id && (
                      <div className="border border-t-0 border-primary rounded-b-lg bg-muted/20 p-4 space-y-4">
                        <ScrollArea className="h-96 border rounded-lg p-4 bg-background">
                          <p className="text-sm whitespace-pre-wrap">{email.body || "본문 없음"}</p>
                        </ScrollArea>
                        {email.attachments && email.attachments.length > 0 && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-semibold mb-2">첨부파일 ({email.attachments.length})</p>
                            <div className="space-y-2">
                              {email.attachments.map((att, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 border rounded bg-background">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm truncate">{att.originalName}</span>
                                    <span className="text-xs text-muted-foreground">
                                      ({(att.size / 1024).toFixed(1)} KB)
                                    </span>
                                  </div>
                                  <div className="flex gap-1">
                                    {att.originalName.toLowerCase().endsWith('.pdf') && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setPreviewFile({ name: att.originalName, path: att.relPath })}
                                          title="미리보기"
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => window.open(`/api/attachments/${att.relPath}`, '_blank')}
                                          title="새 탭에서 열기"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = `/api/attachments/${att.relPath}`;
                                        link.download = att.originalName;
                                        link.click();
                                      }}
                                      title="다운로드"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-full">
            {previewFile && (
              <iframe
                src={`/api/attachments/${previewFile.path}`}
                className="w-full h-full border-0 rounded"
                title={previewFile.name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
