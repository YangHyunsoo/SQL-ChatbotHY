import { useState, useRef, useEffect } from "react";
import { useChat, type Message } from "@/hooks/use-chat";
import { Sidebar, type Conversation } from "@/components/Sidebar";
import { TopNav, type TabType } from "@/components/TopNav";
import { ChatInput } from "@/components/ChatInput";
import { SqlBlock } from "@/components/SqlBlock";
import { DataTable } from "@/components/DataTable";
import { SettingsPage } from "@/components/SettingsPage";
import { DatabasePage } from "@/components/DatabasePage";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, AlertCircle, Sparkles, Terminal, LayoutDashboard, Workflow, Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY = 'sqlchat_history_v1';
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 80;

interface AppSettings {
  modelName: string;
  temperature: number;
  useRag: boolean;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [settings, setSettings] = useState<AppSettings>({
    modelName: 'mistralai/mistral-7b-instruct:free',
    temperature: 0,
    useRag: false
  });
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasInitialized = useRef(false);
  const chatMutation = useChat();

  // Initialize from localStorage
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed.map((c: any) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt)
          }));
          setConversations(restored);
          setActiveConversationId(restored[0].id);
          setMessages(restored[0].messages || []);
          return;
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    createConversation([getWelcomeMessage()]);
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length === 0) return;
    
    const slimConversations = conversations.slice(0, MAX_CONVERSATIONS).map(c => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messages: (messages.filter(() => c.id === activeConversationId) || [])
        .slice(-MAX_MESSAGES)
        .map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }))
    }));

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slimConversations));
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [conversations, messages, activeConversationId]);

  // Update conversation when messages change
  useEffect(() => {
    if (!activeConversationId || messages.length === 0) return;
    
    setConversations(prev => {
      const existing = prev.find(c => c.id === activeConversationId);
      if (!existing) return prev;
      
      const firstUserMsg = messages.find(m => m.role === 'user');
      const newTitle = existing.title === '새 대화' && firstUserMsg?.content 
        ? firstUserMsg.content.slice(0, 24)
        : existing.title;
      
      return prev.map(c => 
        c.id === activeConversationId 
          ? { ...c, title: newTitle, updatedAt: new Date() }
          : c
      );
    });
  }, [messages, activeConversationId]);

  // Theme toggle
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  function getWelcomeMessage(): Message {
    return {
      id: "welcome",
      role: "assistant",
      content: "안녕하세요! 저는 SQL 데이터 어시스턴트입니다. 제품 및 판매 데이터를 분석하는 데 도움을 드릴 수 있습니다. \"가장 많이 팔린 제품은?\" 또는 \"이번 주 판매량을 보여줘\"와 같은 질문을 해보세요.",
      timestamp: new Date()
    };
  }

  function createConversation(seedMessages: Message[] = []) {
    const id = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newConv: Conversation = {
      id,
      title: '새 대화',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(id);
    setMessages(seedMessages.length > 0 ? seedMessages : [getWelcomeMessage()]);
  }

  const handleSend = (content: string) => {
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);

    chatMutation.mutate(content, {
      onSuccess: (data) => {
        const responseMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          sql: data.sql,
          data: data.data,
          error: data.error,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, responseMessage]);
      },
      onError: (error) => {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "죄송합니다, 요청을 처리하는 중 오류가 발생했습니다.",
          error: error.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    });
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    setActiveConversationId(id);
    setMessages([getWelcomeMessage()]);
  };

  const handleDeleteConversation = (id: string) => {
    if (!confirm('이 대화를 삭제할까요?')) return;
    const nextList = conversations.filter(c => c.id !== id);
    setConversations(nextList);
    
    if (activeConversationId === id) {
      if (nextList.length > 0) {
        setActiveConversationId(nextList[0].id);
        setMessages([getWelcomeMessage()]);
      } else {
        createConversation();
      }
    }
  };

  const handleRenameConversation = (id: string, newTitle: string) => {
    setConversations(prev => 
      prev.map(c => c.id === id ? { ...c, title: newTitle } : c)
    );
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
  };

  const sampleQueries = [
    "가장 비싼 상위 5개 제품을 보여줘",
    "카테고리별 총 매출은 얼마야?",
    "최근 7일간의 모든 판매 내역을 보여줘",
    "재고가 20개 미만인 제품은?"
  ];

  const renderChatContent = () => (
    <div className="flex-1 flex flex-col relative">
      <div className="flex-1 px-4 py-8 overflow-y-auto">
        <div className="space-y-8 pb-32 max-w-4xl mx-auto">
          <AnimatePresence mode="popLayout">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`
                  flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm
                  ${msg.role === 'assistant' 
                    ? 'bg-gradient-to-br from-primary to-indigo-600 text-white shadow-primary/20' 
                    : 'bg-muted text-muted-foreground'}
                `}>
                  {msg.role === 'assistant' ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
                </div>

                <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`
                    px-5 py-3.5 rounded-2xl shadow-sm text-sm leading-relaxed
                    ${msg.role === 'user' 
                      ? 'bg-white dark:bg-card text-foreground border border-border rounded-tr-none' 
                      : 'bg-card border border-border/50 text-foreground rounded-tl-none'}
                  `}>
                    {msg.content}
                  </div>

                  {msg.role === 'assistant' && (
                    <div className="w-full space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                      {msg.error && (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/5 border border-destructive/20 text-destructive text-sm">
                          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold">쿼리 처리 오류</span>
                            <span className="opacity-90">{msg.error}</span>
                          </div>
                        </div>
                      )}
                      
                      {msg.sql && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="w-full"
                        >
                          <SqlBlock code={msg.sql} />
                        </motion.div>
                      )}
                      
                      {msg.data && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                          className="w-full"
                        >
                          <DataTable data={msg.data} />
                        </motion.div>
                      )}
                    </div>
                  )}
                  
                  <span className="text-[10px] text-muted-foreground opacity-60 px-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {chatMutation.isPending && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 p-4 rounded-2xl rounded-tl-none bg-card border border-border/50 shadow-sm w-fit">
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 rounded-full bg-primary animate-bounce" />
                </div>
                <span className="text-xs text-muted-foreground animate-pulse ml-1">데이터베이스 분석 중...</span>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
          
          {messages.length <= 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 px-4">
              {sampleQueries.map((query, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(query)}
                  className="group relative p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 text-left transition-all duration-300"
                  data-testid={`sample-query-${i}`}
                >
                  <div className="absolute top-4 right-4 text-primary/20 group-hover:text-primary transition-colors">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors block mb-1">
                    추천 질문
                  </span>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground/80 transition-colors">
                    "{query}"
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-10 pb-4 px-4 z-40">
        <ChatInput onSend={handleSend} isLoading={chatMutation.isPending} />
      </div>
    </div>
  );

  const renderPlaceholderTab = (title: string, icon: typeof LayoutDashboard) => {
    const Icon = icon;
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon className="w-5 h-5" />
              {title}
            </CardTitle>
            <CardDescription>이 기능은 준비 중입니다</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              향후 업데이트에서 이 기능이 추가될 예정입니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'chat':
        return renderChatContent();
      case 'database':
        return <DatabasePage />;
      case 'settings':
        return <SettingsPage settings={settings} onSettingsChange={setSettings} />;
      case 'dashboard':
        return renderPlaceholderTab('대시보드', LayoutDashboard);
      case 'workflow':
        return renderPlaceholderTab('워크플로우', Workflow);
      case 'insights':
        return renderPlaceholderTab('인사이트', Lightbulb);
      default:
        return renderChatContent();
    }
  };

  return (
    <div className="min-h-screen flex bg-background font-sans">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.xls,.xlsx"
        className="hidden"
        onChange={(e) => {
          // File upload handling would go here
          e.target.value = '';
        }}
      />
      
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onNewConversation={() => createConversation()}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onFileUpload={handleFileUpload}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopNav activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 overflow-hidden flex flex-col">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
