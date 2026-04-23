import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { T } from "../theme";

export default function CapitalChart({ data }) {
  const chartData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].reverse();
  }, [data]);

  if (chartData.length === 0) {
    return (
      <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: T.textDim }}>
        Sin datos de capital para mostrar.
      </div>
    );
  }

  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.green} stopOpacity={0.3} />
              <stop offset="95%" stopColor={T.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textDim }} />
          <YAxis tick={{ fontSize: 11, fill: T.textDim }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{
              background: T.bgCardSolid,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="total_value_ars"
            stroke={T.green}
            fillOpacity={1}
            fill="url(#colorTotal)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
