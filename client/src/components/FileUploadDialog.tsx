import { useState, useRef } from "react";
import { Upload, X, FileSpreadsheet, Database, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess: () => void;
}

export function FileUploadDialog({ open, onOpenChange, onUploadSuccess }: FileUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataType, setDataType] = useState<"structured" | "unstructured">("structured");
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      if (!droppedFile.name.endsWith('.csv')) {
        toast({
          variant: "destructive",
          title: "잘못된 파일 형식",
          description: "CSV 파일만 업로드 가능합니다."
        });
        return;
      }
      setFile(droppedFile);
      if (!name) {
        setName(droppedFile.name.replace('.csv', ''));
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
      if (description.trim()) {
        formData.append('description', description.trim());
      }

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
        description: `${result.dataset.rowCount}개의 데이터가 등록되었습니다.`
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
    setDescription("");
    setDataType("structured");
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            CSV 파일 업로드
          </DialogTitle>
          <DialogDescription>
            CSV 파일을 업로드하여 데이터베이스에 등록합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${file ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            `}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-file"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file"
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileSpreadsheet className="w-8 h-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  data-testid="button-remove-file"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  파일을 드래그하거나 클릭하여 선택하세요
                </p>
                <p className="text-xs text-muted-foreground">CSV 파일만 지원 (최대 10MB)</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">데이터셋 이름 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 고객 데이터, 판매 기록"
              data-testid="input-dataset-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명 (선택)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="데이터셋에 대한 간단한 설명"
              rows={2}
              data-testid="input-dataset-description"
            />
          </div>

          <div className="space-y-3">
            <Label>데이터 유형</Label>
            <RadioGroup
              value={dataType}
              onValueChange={(value) => setDataType(value as "structured" | "unstructured")}
              className="grid grid-cols-2 gap-3"
            >
              <Label
                htmlFor="structured"
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${dataType === 'structured' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                `}
              >
                <RadioGroupItem value="structured" id="structured" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-4 h-4" />
                    <span className="font-medium">정형 데이터</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    테이블 형식, SQL 쿼리 가능
                  </p>
                </div>
              </Label>

              <Label
                htmlFor="unstructured"
                className={`
                  flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                  ${dataType === 'unstructured' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                `}
              >
                <RadioGroupItem value="unstructured" id="unstructured" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    <span className="font-medium">비정형 데이터</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    텍스트 검색, 유연한 구조
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1"
              data-testid="button-cancel-upload"
            >
              취소
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !name.trim() || isUploading}
              className="flex-1"
              data-testid="button-submit-upload"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  업로드
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
