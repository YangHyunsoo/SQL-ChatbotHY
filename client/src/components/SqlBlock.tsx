import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface SqlBlockProps {
  code: string;
}

export function SqlBlock({ code }: SqlBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden border border-border bg-muted/30 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/50">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">생성된 SQL</span>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-all duration-200"
          title="SQL 복사"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-sm font-mono text-foreground/90">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
