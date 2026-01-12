import { useState, useRef, useEffect } from "react";
import { useChat, type Message } from "@/hooks/use-chat";
import { Header } from "@/components/Header";
import { ChatInput } from "@/components/ChatInput";
import { SqlBlock } from "@/components/SqlBlock";
import { DataTable } from "@/components/DataTable";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, AlertCircle, Terminal, Sparkles, Database } from "lucide-react";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your SQL data assistant. I can help you analyze your products and sales data. Try asking me something like \"What are the top selling products?\" or \"Show me sales from last week.\"",
      timestamp: new Date()
    }
  ]);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatMutation = useChat();

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
          content: "Sorry, I encountered an error processing your request.",
          error: error.message,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const sampleQueries = [
    "Show me the top 5 most expensive products",
    "What is the total revenue for each category?",
    "List all sales from the last 7 days",
    "Which products have low stock (< 20)?"
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      <Header />

      <main className="flex-1 flex flex-col w-full max-w-5xl mx-auto relative">
        <div className="flex-1 px-4 py-8 overflow-y-auto">
          <div className="space-y-8 pb-32">
            <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm
                    ${msg.role === 'assistant' 
                      ? 'bg-gradient-to-br from-primary to-indigo-600 text-white shadow-primary/20' 
                      : 'bg-muted text-muted-foreground'}
                  `}>
                    {msg.role === 'assistant' ? <Bot className="w-6 h-6" /> : <User className="w-6 h-6" />}
                  </div>

                  {/* Content */}
                  <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`
                      px-5 py-3.5 rounded-2xl shadow-sm text-sm leading-relaxed
                      ${msg.role === 'user' 
                        ? 'bg-white text-foreground border border-border rounded-tr-none' 
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
                              <span className="font-semibold">Error processing query</span>
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
                  <span className="text-xs text-muted-foreground animate-pulse ml-1">Analyzing database schema...</span>
                </div>
              </motion.div>
            )}

            <div ref={bottomRef} />
            
            {/* Empty state suggestions */}
            {messages.length === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 px-4">
                {sampleQueries.map((query, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(query)}
                    className="group relative p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 text-left transition-all duration-300"
                  >
                    <div className="absolute top-4 right-4 text-primary/20 group-hover:text-primary transition-colors">
                      <Terminal className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors block mb-1">
                      Query Suggestion
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

        {/* Input Area */}
        <div className="sticky bottom-0 w-full bg-gradient-to-t from-background via-background to-transparent pt-10 pb-4 px-4 z-40">
          <ChatInput onSend={handleSend} isLoading={chatMutation.isPending} />
        </div>
      </main>
    </div>
  );
}
