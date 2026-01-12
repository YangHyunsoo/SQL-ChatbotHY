import { Database, Zap } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5 group cursor-default">
          <div className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-indigo-500 text-white shadow-lg shadow-primary/25 group-hover:scale-105 transition-transform duration-300">
            <Database className="w-5 h-5" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-background" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg leading-tight text-foreground">
              DataPilot
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              SQL Assistant <Zap className="w-3 h-3 text-yellow-500 fill-yellow-500" />
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">System Operational</span>
          </div>
        </div>
      </div>
    </header>
  );
}
