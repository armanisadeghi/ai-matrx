import React, { useState } from "react";
import { useSelector } from "react-redux";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Sector, Label } from "recharts";
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
import { useWindowSize } from "@uidotdev/usehooks";

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

const StatBox = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) => (
  <div className="text-center">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={cn("text-2xl font-bold", color)}>{value}</p>
  </div>
);

const MobilePerformanceChart = ({
  totalCount,
  totalCorrect,
  totalIncorrect,
  completedCount,
  correctPercentage,
}: {
  totalCount: number;
  totalCorrect: number;
  totalIncorrect: number;
  completedCount: number;
  correctPercentage: number;
}) => (
  <Card className="w-full shadow-lg from-zinc-800 via-zinc-900 to-black">
    <CardHeader className="pb-2">
      <CardTitle className="text-lg">Performance</CardTitle>
    </CardHeader>
    <CardContent>
      <motion.div
        className="flex justify-between items-center"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col items-center">
          <p className="text-3xl font-bold">{correctPercentage}%</p>
          <p className="text-sm text-muted-foreground">Accuracy</p>
        </div>
        <div className="h-12 w-px bg-border mx-4" />
        <div className="flex gap-4">
          <StatBox label="Cards" value={totalCount} />
          <StatBox
            label="Correct"
            value={totalCorrect}
            color={chartConfig.correct.color}
          />
          <StatBox
            label="Incorrect"
            value={totalIncorrect}
            color={chartConfig.incorrect.color}
          />
        </div>
      </motion.div>
    </CardContent>
  </Card>
);

const DesktopPerformanceChart = ({
  totalCount,
  totalCorrect,
  totalIncorrect,
  completedCount,
  correctPercentage,
}: {
  totalCount: number;
  totalCorrect: number;
  totalIncorrect: number;
  completedCount: number;
  correctPercentage: number;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const pieData = [
    { name: "correct", value: totalCorrect, fill: chartConfig.correct.color },
    {
      name: "incorrect",
      value: totalIncorrect,
      fill: chartConfig.incorrect.color,
    },
  ];

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
      props;
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
          <StatBox label="Unique Cards" value={totalCount} />
          <StatBox label="Attempts" value={completedCount} />
          <StatBox
            label="Correct"
            value={totalCorrect}
            color={chartConfig.correct.color}
          />
          <StatBox
            label="Incorrect"
            value={totalIncorrect}
            color={chartConfig.incorrect.color}
          />
        </motion.div>
        <ChartContainer
          id="flashcard-pie"
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[300px]"
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
              // @ts-ignore - activeIndex prop exists in recharts but type definitions may be outdated
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              onMouseEnter={(_, index) => setActiveIndex(index)}
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
      </CardContent>
    </Card>
  );
};

const PerformanceChart: React.FC = () => {
  const { width } = useWindowSize();
  const { totalCount, totalCorrect, totalIncorrect } = useSelector(
    selectPerformanceCounts,
  );
  const completedCount = totalCorrect + totalIncorrect;
  const correctPercentage =
    completedCount > 0 ? Math.round((totalCorrect / completedCount) * 100) : 0;

  const sharedProps = {
    totalCount,
    totalCorrect,
    totalIncorrect,
    completedCount,
    correctPercentage,
  };

  return (width ?? 0) < 768 ? (
    <MobilePerformanceChart {...sharedProps} />
  ) : (
    <DesktopPerformanceChart {...sharedProps} />
  );
};

export default PerformanceChart;
