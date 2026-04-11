"use client";

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ScoreRadarProps {
  correctness: number;
  completeness: number;
  relevance: number;
  faithfulness: number;
}

export function ScoreRadar({
  correctness,
  completeness,
  relevance,
  faithfulness,
}: ScoreRadarProps) {
  const data = [
    { criterion: "Correctness", score: correctness },
    { criterion: "Completeness", score: completeness },
    { criterion: "Relevance", score: relevance },
    { criterion: "Faithfulness", score: faithfulness },
  ];

  return (
    <ResponsiveContainer width="100%" height={250}>
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="criterion" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 5]} tickCount={6} />
        <Radar
          dataKey="score"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.3}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface LanguageBarChartProps {
  data: Array<{
    language: string;
    avgOverall: number;
    count: number;
  }>;
}

export function LanguageBarChart({ data }: LanguageBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="language" />
        <YAxis domain={[0, 5]} />
        <Tooltip />
        <Legend />
        <Bar
          dataKey="avgOverall"
          name="Avg Overall Score"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  let color = "bg-red-100 text-red-800";
  if (score >= 4) color = "bg-green-100 text-green-800";
  else if (score >= 3) color = "bg-yellow-100 text-yellow-800";
  else if (score >= 2) color = "bg-orange-100 text-orange-800";

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {score.toFixed(1)}
    </span>
  );
}
