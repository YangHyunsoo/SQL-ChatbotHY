import { useState, useRef } from "react";
import { X, FileSpreadsheet, Database, FileText, Loader2, Shield, Save, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess: () => void;
}

export function FileUploadDialog({ open, onOpenChange, onUploadSuccess }: FileUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<"structured" | "unstructured">("structured");
  const [anonymize, setAnonymize] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          variant: "destructive",
          title: "잘못된 파일 형식",
          description: "CSV 파일만 업로드 가능합니다."
        });
        return;
      }
      setFile(selectedFile);
      if (!name) {
        setName(selectedFile.name.replace('.csv', ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) {
      toast({
        variant: "destructive",
        title: "필수 항목 누락",
        description: "파일과 데이터셋 이름을 입력해주세요."
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());
      formData.append('dataType', dataType);
      formData.append('anonymize', String(anonymize));

      const response = await fetch('/api/datasets/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      
      toast({
        title: "업로드 완료",
        description: `${result.dataset.rowCount}개의 데이터가 ${dataType === 'structured' ? 'DuckDB' : 'pgvector'}에 저장되었습니다.`
      });

      resetForm();
      onOpenChange(false);
      onUploadSuccess();

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "업로드 실패",
        description: error.message || "파일 업로드 중 오류가 발생했습니다."
      });
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setName("");
    setDataType("structured");
    setAnonymize(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      resetForm();
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">분석 데이터 추가</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isUploading}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-cancel-upload"
            >
              <X className="w-4 h-4 mr-1" />
              취소
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="dataset-name" className="text-sm text-muted-foreground">
              데이터셋 이름
            </Label>
            <Input
              id="dataset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 고객 구매 데이터"
              className="bg-background border-border"
              data-testid="input-dataset-name"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground">데이터 소스</Label>
            
            <div className="flex border-b border-border">
              <button
                className="px-6 py-2.5 text-sm font-medium border-b-2 border-primary text-primary"
                data-testid="tab-csv"
              >
                CSV 파일
              </button>
            </div>

            <div 
              className="flex items-center justify-between p-3 bg-background border border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-file-select"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">파일 선택</span>
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : '선택된 파일 없음'}
                </span>
              </div>
              {file && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  data-testid="button-remove-file"
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file"
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-background border border-border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-muted">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">개인정보 가명처리</p>
                <p className="text-xs text-muted-foreground">
                  이름, 전화번호, 주민번호, 이메일 등을 자동으로 마스킹합니다
                </p>
              </div>
            </div>
            <Switch
              checked={anonymize}
              onCheckedChange={setAnonymize}
              data-testid="switch-anonymize"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">데이터 타입</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as "structured" | "unstructured")}>
              <SelectTrigger 
                className="w-full bg-background border-border"
                data-testid="select-data-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="structured" data-testid="option-structured">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    <span>정형 데이터 (DuckDB - 970배 빠른 분석)</span>
                  </div>
                </SelectItem>
                <SelectItem value="unstructured" data-testid="option-unstructured">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>비정형 데이터 (pgvector - 벡터 검색)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {dataType === 'structured' 
                ? '숫자, 날짜 등 정형화된 데이터 분석에 최적 (DuckDB - MySQL 대비 970배 성능)'
                : '텍스트, 문서 등 비정형 데이터의 시맨틱 검색에 최적 (pgvector - 벡터 임베딩 지원)'
              }
            </p>
          </div>

          <Button
            onClick={handleUpload}
            disabled={!file || !name.trim() || isUploading}
            className="w-full h-12 text-base bg-primary hover:bg-primary/90"
            data-testid="button-submit-upload"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                데이터셋 저장
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
