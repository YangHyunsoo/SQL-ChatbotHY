import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Zap, Database, Plus, Trash2, Power } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Settings {
  modelName: string;
  temperature: number;
  useRag: boolean;
}

interface RagModel {
  id: string;
  name: string;
  enabled: boolean;
}

interface SettingsPageProps {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
}

export function SettingsPage({ settings, onSettingsChange }: SettingsPageProps) {
  const [newModelId, setNewModelId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch RAG models from server
  const { data: modelsData, isLoading: modelsLoading } = useQuery<{ models: RagModel[] }>({
    queryKey: ['/api/rag/models'],
  });

  // Toggle model mutation
  const toggleModelMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return apiRequest('PATCH', `/api/rag/models/${encodeURIComponent(id)}/toggle`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag/models'] });
    },
  });

  // Add model mutation
  const addModelMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest('POST', '/api/rag/models', { id, name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag/models'] });
      setNewModelId("");
      setNewModelName("");
      setShowAddForm(false);
    },
  });

  // Remove model mutation
  const removeModelMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/rag/models/${encodeURIComponent(id)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/rag/models'] });
    },
  });

  const ragModels = modelsData?.models || [];

  const handleAddModel = () => {
    if (newModelId && newModelName) {
      addModelMutation.mutate({ id: newModelId, name: newModelName });
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            SQL 쿼리 모델 설정
          </CardTitle>
          <CardDescription>SQL 쿼리 생성에 사용할 AI 모델을 설정합니다</CardDescription>
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
        <CardContent className="space-y-6">
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

          {/* RAG Model List */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">RAG 모델 관리</Label>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setShowAddForm(!showAddForm)}
                data-testid="button-add-model-toggle"
              >
                <Plus className="w-4 h-4 mr-1" />
                모델 추가
              </Button>
            </div>

            {/* Add Model Form */}
            {showAddForm && (
              <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="new-model-id">모델 ID (OpenRouter 형식)</Label>
                  <Input
                    id="new-model-id"
                    placeholder="예: openai/gpt-3.5-turbo:free"
                    value={newModelId}
                    onChange={(e) => setNewModelId(e.target.value)}
                    data-testid="input-new-model-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-model-name">표시 이름</Label>
                  <Input
                    id="new-model-name"
                    placeholder="예: GPT-3.5 Turbo"
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    data-testid="input-new-model-name"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={handleAddModel}
                    disabled={!newModelId || !newModelName || addModelMutation.isPending}
                    data-testid="button-add-model-confirm"
                  >
                    추가
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => {
                      setShowAddForm(false);
                      setNewModelId("");
                      setNewModelName("");
                    }}
                    data-testid="button-add-model-cancel"
                  >
                    취소
                  </Button>
                </div>
              </div>
            )}

            {/* Model List */}
            {modelsLoading ? (
              <p className="text-sm text-muted-foreground">모델 목록 로딩 중...</p>
            ) : ragModels.length === 0 ? (
              <p className="text-sm text-muted-foreground">등록된 모델이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {ragModels.map((model, index) => (
                  <div 
                    key={model.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    data-testid={`model-item-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <Power className={`w-4 h-4 ${model.enabled ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-sm">{model.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{model.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={model.enabled}
                        onCheckedChange={(checked) => 
                          toggleModelMutation.mutate({ id: model.id, enabled: checked })
                        }
                        data-testid={`switch-model-${index}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeModelMutation.mutate(model.id)}
                        disabled={removeModelMutation.isPending}
                        data-testid={`button-remove-model-${index}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              활성화된 모델은 RAG 질의 시 우선순위에 따라 사용됩니다. 오류 발생 시 다음 모델로 자동 전환됩니다.
            </p>
          </div>
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
