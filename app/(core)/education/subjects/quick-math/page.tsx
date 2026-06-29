// /education/subjects/quick-math — relocated stock algebra lessons.
// "quick-" marks this as preview/stock content occupying a NON-permanent slot;
// the full Mathematics experience is reserved for /education/subjects/math.
// Service + components (features/math/*) are unchanged — only the route moved.
import { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight, GraduationCap, Sparkles } from "lucide-react";
import { getAllMathProblems } from "@/features/math/service";
import { MarketingPageShell } from "@/features/shell/components/MarketingPageShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Quick Math Lessons — Interactive Algebra | AI Matrx Education",
  description:
    "Free interactive algebra lessons with step-by-step problem solving. A preview set of the AI Matrx math experience.",
  keywords:
    "algebra, mathematics, math education, interactive learning, problem solving, step-by-step solutions, free math lessons, algebra practice",
  alternates: { canonical: "/education/subjects/quick-math" },
};

function groupProblemsByModule(
  problems: Awaited<ReturnType<typeof getAllMathProblems>>,
) {
  const grouped: Record<string, typeof problems> = {};
  problems.forEach((problem) => {
    const key = `${problem.course_name}|${problem.topic_name}|${problem.module_name}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(problem);
  });
  return Object.entries(grouped).map(([key, items]) => {
    const [courseName, topicName, moduleName] = key.split("|");
    return {
      courseName,
      topicName,
      moduleName,
      problems: items.sort((a, b) => a.sort_order - b.sort_order),
    };
  });
}

export default async function QuickMathPage() {
  const problems = await getAllMathProblems();
  const groupedProblems = groupProblemsByModule(problems);

  return (
    <MarketingPageShell>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Preview-content note — this is stock content in a temporary slot. */}
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          Preview lessons. The full Mathematics experience is coming to{" "}
          <Link href="/education/subjects/math" className="text-primary hover:underline">
            /education/subjects/math
          </Link>
          .
        </div>

        <div className="mb-8">
          <div className="flex items-center gap-4 mb-3">
            <div className="rounded-full bg-primary/10 p-3">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold">Quick Math Lessons</h1>
              <p className="text-lg text-muted-foreground">
                Master Algebra with Step-by-Step Solutions
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground/80 max-w-3xl">
            Free, interactive lessons designed to help you understand and master
            algebraic concepts through detailed problem solving.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="text-center">
            <CardContent className="py-4">
              <div className="text-2xl font-bold text-primary mb-1">{problems.length}</div>
              <div className="text-xs text-muted-foreground">Problems</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="py-4">
              <div className="text-2xl font-bold text-primary mb-1">{groupedProblems.length}</div>
              <div className="text-xs text-muted-foreground">Modules</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="py-4">
              <div className="text-2xl font-bold text-primary mb-1">Free</div>
              <div className="text-xs text-muted-foreground">Access</div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {groupedProblems.map((group) => (
            <div key={`${group.courseName}-${group.topicName}-${group.moduleName}`}>
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <h2 className="text-xl font-bold">{group.moduleName}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {group.topicName} • {group.courseName}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.problems.map((problem) => (
                  <Link
                    key={problem.id}
                    href={`/education/subjects/quick-math/${problem.id}`}
                    className="group"
                  >
                    <Card className="h-full transition-all hover:shadow-lg hover:-translate-y-1">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                            {problem.title}
                          </CardTitle>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                        </div>
                        {problem.difficulty_level && (
                          <Badge
                            variant={
                              problem.difficulty_level === "easy"
                                ? "default"
                                : problem.difficulty_level === "medium"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className="w-fit"
                          >
                            {problem.difficulty_level}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="line-clamp-3">
                          {problem.description ||
                            "Interactive problem solving with step-by-step explanations"}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {problems.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No problems available yet</h3>
              <p className="text-muted-foreground">Check back soon for new learning materials!</p>
            </CardContent>
          </Card>
        )}
      </div>
    </MarketingPageShell>
  );
}
