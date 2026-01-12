import { motion } from "framer-motion";

interface DataTableProps {
  data: any[];
}

export function DataTable({ data }: DataTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="p-6 text-center border border-border border-dashed rounded-xl bg-muted/10 text-muted-foreground italic">
        No data returned from query
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="relative w-full overflow-hidden border border-border rounded-xl bg-card shadow-sm my-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-muted/30 border-b border-border">
            <tr>
              {columns.map((col) => (
                <th key={col} className="px-6 py-3 font-semibold whitespace-nowrap">
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
                  <td key={`${i}-${col}`} className="px-6 py-4 whitespace-nowrap text-foreground/80">
                    {row[col]?.toString() ?? <span className="text-muted-foreground italic">null</span>}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-muted/10 border-t border-border/50 text-xs text-muted-foreground text-right">
        {data.length} row{data.length !== 1 && 's'} returned
      </div>
    </div>
  );
}
