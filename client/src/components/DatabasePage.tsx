import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Database, Table, Loader2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ColumnInfo {
  name: string;
  type: string;
  description: string;
}

interface TableInfo {
  name: string;
  description?: string;
  columns: ColumnInfo[] | string[];
  rowCount: number;
}

export function DatabasePage() {
  const { data: tables, isLoading } = useQuery<TableInfo[]>({
    queryKey: ['/api/tables']
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isEnhancedColumn = (col: ColumnInfo | string): col is ColumnInfo => {
    return typeof col === 'object' && 'name' in col;
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Database className="w-5 h-5" />
          데이터베이스
        </h2>
        <p className="text-sm text-muted-foreground mt-1">현재 연결된 데이터베이스의 테이블 목록입니다</p>
      </div>

      <div className="grid gap-4">
        {tables && tables.length > 0 ? (
          tables.map((table) => (
            <Card key={table.name}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Table className="w-4 h-4" />
                  {table.name}
                </CardTitle>
                <CardDescription>
                  {table.description && <span className="mr-2">{table.description}</span>}
                  <span className="text-primary font-medium">{table.rowCount.toLocaleString()}개 행</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium mb-2">컬럼 정보</p>
                  <div className="grid gap-2">
                    {table.columns.map((col) => (
                      isEnhancedColumn(col) ? (
                        <div
                          key={col.name}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{col.name}</span>
                            <span className="px-1.5 py-0.5 text-xs bg-primary/10 text-primary rounded">
                              {col.type}
                            </span>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                                <Info className="w-3 h-3" />
                                <span className="hidden sm:inline">{col.description}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p>{col.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      ) : (
                        <span
                          key={col}
                          className="px-2 py-1 text-xs bg-muted rounded-md text-muted-foreground inline-block"
                        >
                          {col}
                        </span>
                      )
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              데이터베이스에 테이블이 없습니다
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Info className="w-4 h-4" />
            테이블 관계
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-1">
            <p><code className="text-primary">sales.product_id</code> → <code className="text-primary">products.id</code></p>
            <p className="text-xs">하나의 제품에 여러 판매 기록이 연결됩니다 (1:N 관계)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
