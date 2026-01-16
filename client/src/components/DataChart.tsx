import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, LineChartIcon, PieChartIcon, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataChartProps {
  data: any[];
}

type ChartType = "table" | "bar" | "line" | "pie";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 280 65% 60%))",
  "hsl(var(--chart-3, 45 93% 47%))",
  "hsl(var(--chart-4, 160 60% 45%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "hsl(220, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
];

function analyzeDataForChart(data: any[]): { 
  labelKey: string | null; 
  valueKeys: string[];
  canChart: boolean;
  suggestedType: ChartType;
} {
  if (!data || data.length === 0) {
    return { labelKey: null, valueKeys: [], canChart: false, suggestedType: "table" };
  }

  const columns = Object.keys(data[0]);
  const numericColumns: string[] = [];
  const textColumns: string[] = [];

  for (const col of columns) {
    const values = data.map(row => row[col]);
    const numericCount = values.filter(v => {
      if (v === null || v === undefined) return false;
      const num = parseFloat(String(v).replace(/,/g, ''));
      return !isNaN(num) && isFinite(num);
    }).length;

    if (numericCount / data.length > 0.7) {
      numericColumns.push(col);
    } else {
      textColumns.push(col);
    }
  }

  if (numericColumns.length === 0) {
    return { labelKey: null, valueKeys: [], canChart: false, suggestedType: "table" };
  }

  const labelKey = textColumns.length > 0 ? textColumns[0] : null;
  
  let suggestedType: ChartType = "bar";
  if (data.length <= 6 && numericColumns.length === 1) {
    suggestedType = "pie";
  } else if (data.length > 10) {
    suggestedType = "line";
  }

  return {
    labelKey,
    valueKeys: numericColumns.slice(0, 3),
    canChart: true,
    suggestedType,
  };
}

function formatValue(value: any): number {
  if (value === null || value === undefined) return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

function formatDisplayValue(value: number): string {
  if (value >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  } else if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export function DataChart({ data }: DataChartProps) {
  const analysis = analyzeDataForChart(data);
  const [chartType, setChartType] = useState<ChartType>(analysis.canChart ? analysis.suggestedType : "table");

  if (!data || data.length === 0) {
    return null;
  }

  const { labelKey, valueKeys, canChart } = analysis;

  if (!canChart) {
    return null;
  }

  const chartData = data.map((row, idx) => {
    const item: any = {
      name: labelKey ? String(row[labelKey]).slice(0, 20) : `항목 ${idx + 1}`,
    };
    for (const key of valueKeys) {
      item[key] = formatValue(row[key]);
    }
    return item;
  }).slice(0, 50);

  const renderChart = () => {
    switch (chartType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11 }}
                interval={chartData.length > 10 ? Math.floor(chartData.length / 8) : 0}
                angle={chartData.length > 8 ? -45 : 0}
                textAnchor={chartData.length > 8 ? "end" : "middle"}
                height={chartData.length > 8 ? 60 : 30}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatDisplayValue} />
              <Tooltip 
                formatter={(value: number) => formatDisplayValue(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {valueKeys.map((key, idx) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  fill={CHART_COLORS[idx % CHART_COLORS.length]} 
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11 }}
                interval={chartData.length > 10 ? Math.floor(chartData.length / 8) : 0}
                angle={chartData.length > 8 ? -45 : 0}
                textAnchor={chartData.length > 8 ? "end" : "middle"}
                height={chartData.length > 8 ? 60 : 30}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={formatDisplayValue} />
              <Tooltip 
                formatter={(value: number) => formatDisplayValue(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              {valueKeys.map((key, idx) => (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case "pie":
        const pieData = chartData.slice(0, 8).map((item, idx) => ({
          name: item.name,
          value: item[valueKeys[0]] || 0,
          fill: CHART_COLORS[idx % CHART_COLORS.length],
        }));
        
        return (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={{ strokeWidth: 1 }}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value: number) => formatDisplayValue(value)}
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--card))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  if (chartType === "table") {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full border border-border rounded-xl bg-card shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/20">
        <span className="text-xs font-medium text-muted-foreground">데이터 시각화</span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant={chartType === "bar" ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => setChartType("bar")}
            data-testid="chart-type-bar"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={chartType === "line" ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => setChartType("line")}
            data-testid="chart-type-line"
          >
            <LineChartIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={chartType === "pie" ? "default" : "ghost"}
            className="h-7 w-7"
            onClick={() => setChartType("pie")}
            data-testid="chart-type-pie"
          >
            <PieChartIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="p-3">
        {renderChart()}
      </div>
    </motion.div>
  );
}

export function ChartToggle({ 
  showChart, 
  onToggle, 
  canChart 
}: { 
  showChart: boolean; 
  onToggle: () => void; 
  canChart: boolean;
}) {
  if (!canChart) return null;

  return (
    <Button
      size="sm"
      variant={showChart ? "default" : "outline"}
      className="h-7 text-xs gap-1.5"
      onClick={onToggle}
      data-testid="toggle-chart"
    >
      <BarChart3 className="h-3.5 w-3.5" />
      {showChart ? "차트 숨기기" : "차트 보기"}
    </Button>
  );
}

export function canShowChart(data: any[]): boolean {
  if (!data || data.length === 0) return false;
  const analysis = analyzeDataForChart(data);
  return analysis.canChart;
}
