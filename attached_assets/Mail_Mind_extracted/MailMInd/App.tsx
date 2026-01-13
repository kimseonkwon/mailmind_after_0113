import { Switch, Route, Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import Home from "@/pages/home";
import ChatPage from "@/pages/chat";
import CalendarPage from "@/pages/calendar";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";

import {
  Mail,
  MessageCircle,
  Calendar,
  Settings,
  Filter,
  FileText,
  Search,
} from "lucide-react";

/* =========================================================
   이메일 자동 분류 페이지
========================================================= */
function AutoClassifyPage() {
  const [topK, setTopK] = useState(20);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const categories = [
    { key: "task", label: "업무요청", badge: "Task Request" },
    { key: "meeting", label: "회의", badge: "Meeting" },
    { key: "approval", label: "결재요청", badge: "Approval Request" },
    { key: "notice", label: "공지", badge: "Notice" },
  ];

  const categoryLabelMap: Record<string, string> = {
    task: "업무요청",
    meeting: "회의",
    approval: "결재요청",
    notice: "공지",
  };

  useEffect(() => {
    fetch("/api/emails?limit=2000")
      .then((res) => res.json())
      .then((data) => {
        setEmails(data);

        const map: Record<string, number> = {};
        for (const c of categories) map[c.key] = 0;

        for (const e of data) {
          if (map[e.classification] !== undefined) {
            map[e.classification]++;
          }
        }
        setCounts(map);
      });
  }, []);

  const filteredEmails = selectedCategory
    ? emails
        .filter((e) => e.classification === selectedCategory)
        .slice(0, topK)
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="rounded-lg bg-primary p-2">
            <Filter className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">이메일 자동 분류</h1>
            <p className="text-xs text-muted-foreground">
              카테고리별 이메일 자동 분류 결과
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 상단 컨트롤 */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">결과 수</span>
          <Input
            type="number"
            min={1}
            max={50}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            className="w-20"
          />
          <Button>
            <Search className="h-4 w-4 mr-1" />
            분류 실행
          </Button>
        </div>

        {/* 카테고리 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {categories.map((c) => (
            <Card
              key={c.key}
              onClick={() => {
                setSelectedCategory(c.key);
                setSelectedEmail(null);
              }}
              className={`cursor-pointer transition ${
                selectedCategory === c.key
                  ? "ring-2 ring-primary"
                  : "hover:bg-muted/50"
              }`}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.label}</span>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">
                  {counts[c.key] || 0}
                </div>
                <Badge variant="secondary">{c.badge}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 분류 결과 */}
        <Card>
          <CardHeader>
            <CardTitle>
              분류 결과
              {selectedCategory && (
                <span className="ml-2 text-muted-foreground">
                  ({categoryLabelMap[selectedCategory]})
                </span>
              )}
            </CardTitle>
            <CardDescription>
              선택한 카테고리에 해당하는 이메일 목록
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            {!selectedCategory && (
              <p className="text-muted-foreground text-center">
                카테고리를 선택하면 이메일 목록이 표시됩니다.
              </p>
            )}

            {selectedCategory && filteredEmails.length === 0 && (
              <p className="text-muted-foreground text-center">
                해당 카테고리로 분류된 이메일이 없습니다.
              </p>
            )}

            {filteredEmails.map((email) => (
              <div
                key={email.id}
                onClick={() => setSelectedEmail(email)}
                className={`border rounded-md p-3 cursor-pointer
                  hover:bg-muted/30
                  ${
                    selectedEmail?.id === email.id
                      ? "ring-2 ring-primary"
                      : ""
                  }`}
              >
                <div className="font-medium">{email.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {email.sender || "발신자 없음"} ·{" "}
                  {email.date || "날짜 없음"}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 이메일 내용 보기 */}
        {selectedEmail && (
          <Card>
            <CardHeader>
              <CardTitle>이메일 내용</CardTitle>
              <CardDescription>
                {selectedEmail.subject}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <strong>발신자:</strong>{" "}
                {selectedEmail.sender || "없음"}
              </div>
              <div>
                <strong>날짜:</strong>{" "}
                {selectedEmail.date || "없음"}
              </div>
              <div className="whitespace-pre-wrap border-t pt-3">
                {selectedEmail.body || "본문 없음"}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

/* =========================================================
   네비게이션 / 라우터 / App
========================================================= */
function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t
      bg-background/95 backdrop-blur
      supports-[backdrop-filter]:bg-background/60
      md:relative md:border-t-0 md:border-r
      md:h-screen md:w-16">
      <div className="flex md:flex-col items-center justify-around md:justify-start md:pt-4 gap-1 p-2">
        <Link href="/">
          <Button variant={location === "/" ? "secondary" : "ghost"} size="icon" className="h-12 w-12">
            <Mail className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/chat">
          <Button variant={location === "/chat" ? "secondary" : "ghost"} size="icon" className="h-12 w-12">
            <MessageCircle className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/auto-classify">
          <Button variant={location === "/auto-classify" ? "secondary" : "ghost"} size="icon" className="h-12 w-12">
            <Filter className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/calendar">
          <Button variant={location === "/calendar" ? "secondary" : "ghost"} size="icon" className="h-12 w-12">
            <Calendar className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button variant={location === "/settings" ? "secondary" : "ghost"} size="icon" className="h-12 w-12">
            <Settings className="h-5 w-5" />
          </Button>
        </Link>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chat" component={ChatPage} />
      <Route path="/auto-classify" component={AutoClassifyPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex flex-col-reverse md:flex-row">
          <Navigation />
          <main className="flex-1 pb-16 md:pb-0">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
