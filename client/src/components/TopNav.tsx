import { MessageSquare, LayoutDashboard, Database, Settings, Workflow, Lightbulb } from "lucide-react";

export type TabType = 'chat' | 'dashboard' | 'workflow' | 'insights' | 'database' | 'settings';

interface TopNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: typeof MessageSquare }[] = [
  { id: 'chat', label: '채팅', icon: MessageSquare },
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
  { id: 'workflow', label: '워크플로우', icon: Workflow },
  { id: 'insights', label: '인사이트', icon: Lightbulb },
  { id: 'database', label: '데이터베이스', icon: Database },
];

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="px-6 h-16 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-xl font-bold text-foreground">
            {activeTab === 'settings' ? '설정' : '데이터 코파일럿'}
          </h1>
          <p className="text-xs text-muted-foreground">
            {activeTab === 'settings' 
              ? '모델과 설정을 조정하세요' 
              : '질문하면 SQL과 차트를 바로 만들어 드립니다'}
          </p>
        </div>

        <nav className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                ${activeTab === tab.id 
                  ? 'bg-primary/10 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'}
              `}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          
          <div className="w-px h-6 bg-border mx-2" />
          
          <button
            onClick={() => onTabChange('settings')}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
              ${activeTab === 'settings' 
                ? 'bg-primary/10 text-primary' 
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'}
            `}
            data-testid="tab-settings"
          >
            <Settings className="w-4 h-4" />
            설정
          </button>
        </nav>
      </div>
    </header>
  );
}
