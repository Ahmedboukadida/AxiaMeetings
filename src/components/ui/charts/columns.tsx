"use client";

import React from "react";
import BarChartComponent from "./bars";

interface ColumnChartProps {
  data: any[];
  xKey: string;
  series: {
    key: string;
    name: string;
    color: string;
  }[];
  height?: number | string;
}

export default function ColumnChartComponent(props: ColumnChartProps) {
  return <BarChartComponent {...props} horizontal={false} />;
}
