import { motion } from "framer-motion";

interface DataTableProps {
  data: any[];
}

export function DataTable({ data }: DataTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-center border border-border border-dashed rounded-xl bg-muted/10 text-muted-foreground italic">
        쿼리 결과가 없습니다
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="relative w-full overflow-hidden border border-border rounded-lg sm:rounded-xl bg-card shadow-sm my-2 sm:my-4">
      <div className="overflow-x-auto -mx-px">
        <table className="w-full text-xs sm:text-sm text-left min-w-[400px]">
          <thead className="text-[10px] sm:text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-3 sm:px-6 py-2 sm:py-3 font-semibold whitespace-nowrap">
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map((row, i) => (
              <motion.tr 
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className="bg-card hover:bg-muted/20 transition-colors"
              >
                {columns.map((col) => (
                  <td key={`${i}-${col}`} className="px-3 sm:px-6 py-2.5 sm:py-4 whitespace-nowrap text-foreground/80">
                    {row[col]?.toString() ?? <span className="text-muted-foreground italic">null</span>}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-muted/10 border-t border-border/50 text-[10px] sm:text-xs text-muted-foreground text-right">
        {data.length}개 행 반환됨
      </div>
    </div>
  );
}
