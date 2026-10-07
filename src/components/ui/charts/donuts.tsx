"use client";

import React from "react";
import PieChartComponent from "./pies";

interface DonutChartProps {
  data: { name: string; value: number }[];
  colors?: string[];
  height?: number | string;
}

export default function DonutChartComponent(props: DonutChartProps) {
  return <PieChartComponent {...props} donut={true} />;
}
