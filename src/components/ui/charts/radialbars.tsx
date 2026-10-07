"use client";

import React from "react";
import { RadialBarChart, RadialBar, Legend, ResponsiveContainer, Tooltip, Cell } from "recharts";

interface RadialBarChartProps {
  data: { name: string; value: number; fill?: string }[];
  height?: number | string;
  totalLabel?: string;
  hideLegend?: boolean;
}

const DEFAULT_COLORS = ["#002B5B", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444"];

export default function RadialBarChartComponent({
  data,
  height = 300,
  totalLabel,
  hideLegend = false,
}: RadialBarChartProps) {
  const [hovered, setHovered] = React.useState<{ name: string; value: number } | null>(null);
  
  // Sort ascending: smallest value innermost (index 0), largest value outermost (last index)
  const sortedData = [...data].sort((a, b) => a.value - b.value);
  
  const processedData = sortedData.map((d, i) => ({
    ...d,
    fill: d.fill || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="100%"
          barSize={12}
          startAngle={90}
          endAngle={-270}
          data={processedData}
        >
          <RadialBar
            background={{ fill: "#f1f5f9" }}
            dataKey="value"
            radius={6}
            onMouseEnter={(info: any) => {
              if (info && info.payload) {
                setHovered({ name: info.payload.name, value: info.payload.value });
              } else if (info && info.name) {
                setHovered({ name: info.name, value: info.value });
              }
            }}
            onMouseLeave={() => setHovered(null)}
          >
            {processedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.fill} 
                onMouseEnter={() => setHovered({ name: entry.name, value: entry.value })}
                onMouseLeave={() => setHovered(null)}
              />
            ))}
          </RadialBar>
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
              iconSize={10}
              layout="vertical"
              verticalAlign="middle"
              align="right"
              wrapperStyle={{
                fontSize: "11px",
                fontWeight: "bold",
                color: "#64748b",
              }}
            />
          )}
        </RadialBarChart>
      </ResponsiveContainer>

      {totalLabel && (
        <div 
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none"
          }}
          className="flex flex-col items-center justify-center max-w-[80px]"
        >
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider truncate w-full text-center">
            {hovered ? hovered.name : totalLabel}
          </span>
          <span className="text-xl font-bold text-slate-800 leading-none mt-0.5">
            {(hovered ? hovered.value : total).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}
