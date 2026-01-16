import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Bot, Zap, Database } from "lucide-react";

interface Settings {
  modelName: string;
  temperature: number;
  useRag: boolean;
}

interface SettingsPageProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsPage({ settings, onSettingsChange }: SettingsPageProps) {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            모델 설정
          </CardTitle>
          <CardDescription>AI 모델과 관련된 설정을 조정합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="model">모델 선택</Label>
            <Select
              value={settings.modelName}
              onValueChange={(value) => onSettingsChange({ ...settings, modelName: value })}
            >
              <SelectTrigger id="model" data-testid="select-model">
                <SelectValue placeholder="모델을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mistralai/mistral-7b-instruct:free">Mistral 7B (무료)</SelectItem>
                <SelectItem value="mistralai/mistral-small-3.1-24b-instruct:free">Mistral Small 24B (무료)</SelectItem>
                <SelectItem value="meta-llama/llama-3.2-3b-instruct:free">Llama 3.2 3B (무료)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              낮은 사양에서는 Mistral 7B를 권장합니다
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature: {settings.temperature.toFixed(1)}</Label>
            </div>
            <Slider
              value={[settings.temperature]}
              onValueChange={([value]) => onSettingsChange({ ...settings, temperature: value })}
              min={0}
              max={1}
              step={0.1}
              className="w-full"
              data-testid="slider-temperature"
            />
            <p className="text-xs text-muted-foreground">
              낮을수록 일관된 답변, 높을수록 창의적인 답변
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            지식베이스 검색 (RAG)
          </CardTitle>
          <CardDescription>문서 기반 질의응답 설정</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>지식베이스 검색 모드</Label>
              <p className="text-xs text-muted-foreground">
                활성화하면 SQL 쿼리 대신 등록된 문서에서 답변을 검색합니다
              </p>
            </div>
            <Switch
              checked={settings.useRag}
              onCheckedChange={(checked) => onSettingsChange({ ...settings, useRag: checked })}
              data-testid="switch-rag"
            />
          </div>
          {settings.useRag && (
            <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-primary">
                지식베이스 모드가 활성화되었습니다. 채팅에서 등록된 문서 내용을 검색하고 요약, 발췌 등의 답변을 받을 수 있습니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            성능 최적화
          </CardTitle>
          <CardDescription>저사양 시스템을 위한 최적화 설정</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              현재 시스템은 <span className="font-medium text-foreground">Intel i5 CPU + 8GB RAM</span>에 최적화되어 있습니다.
            </p>
            <ul className="mt-3 text-sm text-muted-foreground space-y-1">
              <li>• Mistral 7B 무료 모델 사용</li>
              <li>• 토큰 제한 적용 (SQL: 256, 응답: 512)</li>
              <li>• 빠른 응답을 위한 간소화된 프롬프트</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
