"use client";

import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface DoughnutChartProps {
  data: { name: string; value: number }[];
  colors?: string[];
  height?: number | string;
  totalLabel?: string;
  hideLegend?: boolean;
}

const DEFAULT_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function DoughnutChartComponent({
  data,
  colors = DEFAULT_COLORS,
  height = 300,
  totalLabel = "Total",
  hideLegend = false,
}: DoughnutChartProps) {
  const [hovered, setHovered] = React.useState<{ name: string; value: number } | null>(null);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={4}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={colors[index % colors.length]} 
                onMouseEnter={() => setHovered({ name: entry.name, value: entry.value })}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "none",
              boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
              padding: "12px",
            }}
            labelStyle={{ display: "none" }}
          />
          {!hideLegend && (
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{
                fontSize: "11px",
                fontWeight: "bold",
                textTransform: "uppercase",
                paddingTop: "15px",
                color: "#64748b",
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      
      <div 
        style={{
          position: "absolute",
          top: hideLegend ? "50%" : "40%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none"
        }}
        className="flex flex-col items-center justify-center max-w-[100px]"
      >
        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate w-full text-center">
          {hovered ? hovered.name : totalLabel}
        </span>
        <span className="text-xl font-bold text-slate-800 leading-none mt-0.5">
          {(hovered ? hovered.value : total).toLocaleString()}
        </span>
      </div>
    </div>
  );
}
