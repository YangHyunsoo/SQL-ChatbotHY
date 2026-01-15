import { useState } from "react";
import { Plus, MessageSquare, Trash2, Edit3, Upload, Database, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onFileUpload: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export function Sidebar({
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onFileUpload,
  isDarkMode,
  onToggleTheme
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEdit = (id: string, currentTitle: string) => {
    setEditingId(id);
    setEditTitle(currentTitle);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
    setEditTitle("");
  };

  return (
    <div className="w-72 h-screen bg-card border-r border-border flex flex-col">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold text-foreground">SQL 어시스턴트</h1>
        </div>
        
        <div className="space-y-2">
          <Button 
            onClick={onFileUpload}
            variant="outline" 
            className="w-full justify-start gap-2"
            data-testid="button-file-upload"
          >
            <Upload className="w-4 h-4" />
            파일 첨부
          </Button>
          <Button 
            onClick={onNewConversation}
            className="w-full justify-start gap-2"
            data-testid="button-new-conversation"
          >
            <Plus className="w-4 h-4" />
            새 대화
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 pb-2">
          <h2 className="text-sm font-semibold text-muted-foreground">대화 기록</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">저장된 대화가 없습니다.</p>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`
                    group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors
                    ${activeConversationId === conv.id 
                      ? 'bg-primary/10 text-primary' 
                      : 'hover:bg-muted text-foreground'}
                  `}
                  onClick={() => onSelectConversation(conv.id)}
                  data-testid={`conversation-item-${conv.id}`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  
                  {editingId === conv.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveEdit(conv.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(conv.id)}
                      className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 text-sm truncate">{conv.title}</span>
                  )}

                  <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(conv.id, conv.title);
                      }}
                      className="p-1 hover:bg-background rounded"
                      data-testid={`button-rename-${conv.id}`}
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
                      data-testid={`button-delete-${conv.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          className="w-full justify-start gap-2"
          data-testid="button-theme-toggle"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isDarkMode ? '라이트 모드' : '다크 모드'}
        </Button>
      </div>
    </div>
  );
}
