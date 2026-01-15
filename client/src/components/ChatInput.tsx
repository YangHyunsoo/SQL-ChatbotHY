import { Send, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="relative max-w-4xl mx-auto w-full p-2 sm:p-4">
      <form
        onSubmit={handleSubmit}
        className={`
          relative flex items-end gap-2 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border bg-background/80 backdrop-blur-xl shadow-lg transition-all duration-300
          ${isLoading ? 'border-primary/20 shadow-primary/5 cursor-wait' : 'border-border focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 focus-within:shadow-xl'}
        `}
      >
        <div className="flex-1 min-w-0 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            placeholder="데이터에 대해 질문해 보세요..."
            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 max-h-[120px] bg-transparent border-none text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:ring-0 resize-none font-medium leading-relaxed"
            rows={1}
            data-testid="input-chat"
          />
        </div>
        
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={`
            mb-0.5 sm:mb-1 p-2.5 sm:p-3 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-200
            ${!input.trim() || isLoading 
              ? 'bg-muted text-muted-foreground cursor-not-allowed' 
              : 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0'
            }
          `}
          data-testid="button-send"
        >
          {isLoading ? (
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
          ) : (
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>
      </form>
      <div className="mt-2 text-center">
        <p className="text-[10px] sm:text-xs text-muted-foreground">
          AI가 생성한 SQL 쿼리입니다. 비즈니스 결정을 내리기 전에 결과를 확인하세요.
        </p>
      </div>
    </div>
  );
}
