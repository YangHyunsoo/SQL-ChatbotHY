import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Database, Table, Loader2 } from "lucide-react";

interface TableInfo {
  name: string;
  columns: string[];
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

  return (
    <div className="p-6 space-y-6">
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
                <CardDescription>{table.rowCount}개 행</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {table.columns.map((col) => (
                    <span
                      key={col}
                      className="px-2 py-1 text-xs bg-muted rounded-md text-muted-foreground"
                    >
                      {col}
                    </span>
                  ))}
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
    </div>
  );
}
