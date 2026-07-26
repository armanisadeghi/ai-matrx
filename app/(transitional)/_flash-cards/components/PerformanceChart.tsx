import React, { useSyncExternalStore } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  Sector,
  Label,
  type PieSectorDataItem,
} from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { selectPerformanceCounts } from "@/lib/redux/selectors/flashcardSelectors";
import { useAppSelector } from "@/lib/redux/hooks";

interface PerformanceChartProps {
  /** Static deck size — same on server and client (avoids Redux hydration mismatch). */
  cardCount: number;
}

const chartConfig = {
  correct: {
    label: "Correct",
    color: "hsl(var(--success))",
  },
  incorrect: {
    label: "Incorrect",
    color: "hsl(var(--destructive))",
  },
} satisfies ChartConfig;

const subscribeToHydration = () => () => undefined;
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

const PerformanceChart: React.FC<PerformanceChartProps> = ({ cardCount }) => {
  const hasMounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );

  const { totalCorrect, totalIncorrect } = useAppSelector(
    selectPerformanceCounts,
  );
  const displayCorrect = hasMounted ? totalCorrect : 0;
  const displayIncorrect = hasMounted ? totalIncorrect : 0;
  const completedCount = displayCorrect + displayIncorrect;
  const correctPercentage =
    completedCount > 0
      ? Math.round((displayCorrect / completedCount) * 100)
      : 0;

  const pieData = [
    { name: "correct", value: displayCorrect, fill: chartConfig.correct.color },
    {
      name: "incorrect",
      value: displayIncorrect,
      fill: chartConfig.incorrect.color,
    },
  ];

  const renderActiveShape = (props: PieSectorDataItem) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
      props;

    if (
      typeof cx !== "number" ||
      typeof cy !== "number" ||
      typeof innerRadius !== "number" ||
      typeof outerRadius !== "number" ||
      typeof startAngle !== "number" ||
      typeof endAngle !== "number" ||
      typeof fill !== "string"
    ) {
      return null;
    }

    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 10}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 12}
          outerRadius={outerRadius + 25}
          fill={fill}
        />
      </g>
    );
  };

  return (
    <Card className="w-full h-full flex flex-col hover:scale-105 transition-transform shadow-lg from-zinc-800 via-zinc-900 to-black">
      <ChartStyle id="flashcard-pie" config={chartConfig} />
      <CardHeader>
        <CardTitle>Performance</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-between">
        <motion.div
          className="flex justify-around mb-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Unique Cards</p>
            <p className="text-2xl font-bold">{cardCount}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Attempts</p>
            <p className="text-2xl font-bold">{completedCount}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Correct</p>
            <p className={cn("text-2xl font-bold", chartConfig.correct.color)}>
              {displayCorrect}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Incorrect</p>
            <p
              className={cn("text-2xl font-bold", chartConfig.incorrect.color)}
            >
              {displayIncorrect}
            </p>
          </div>
        </motion.div>
        {hasMounted ? (
          <ChartContainer
            id="flashcard-pie"
            config={chartConfig}
            className="mx-auto aspect-square w-full max-w-[300px] min-h-[200px]"
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius="80%"
                paddingAngle={5}
                activeShape={renderActiveShape}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {correctPercentage}%
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            Correct
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <div
            aria-hidden
            className="mx-auto aspect-square w-full max-w-[300px] min-h-[200px] rounded-lg bg-muted/40"
          />
        )}
      </CardContent>
    </Card>
  );
};

export default PerformanceChart;
