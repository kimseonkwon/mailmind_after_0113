import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Home from "@/pages/home";
import ImportPage from "@/pages/import";
import ChatPage from "@/pages/chat";
import CalendarPage from "@/pages/calendar";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { Search, FolderUp, MessageCircle, Calendar, Settings } from "lucide-react";

function Navigation() {
  const [location] = useLocation();
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:relative md:border-t-0 md:border-r md:h-screen md:w-16">
      <div className="flex md:flex-col items-center justify-around md:justify-start md:pt-4 gap-1 p-2">
        <Link href="/">
          <Button 
            variant={location === "/" ? "secondary" : "ghost"} 
            size="icon"
            className="h-12 w-12"
            data-testid="nav-search"
          >
            <Search className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/import">
          <Button 
            variant={location === "/import" ? "secondary" : "ghost"} 
            size="icon"
            className="h-12 w-12"
            data-testid="nav-import"
          >
            <FolderUp className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/chat">
          <Button 
            variant={location === "/chat" ? "secondary" : "ghost"} 
            size="icon"
            className="h-12 w-12"
            data-testid="nav-chat"
          >
            <MessageCircle className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/calendar">
          <Button 
            variant={location === "/calendar" ? "secondary" : "ghost"} 
            size="icon"
            className="h-12 w-12"
            data-testid="nav-calendar"
          >
            <Calendar className="h-5 w-5" />
          </Button>
        </Link>
        <Link href="/settings">
          <Button 
            variant={location === "/settings" ? "secondary" : "ghost"} 
            size="icon"
            className="h-12 w-12"
            data-testid="nav-settings"
          >
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
      <Route path="/import" component={ImportPage} />
      <Route path="/chat" component={ChatPage} />
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
