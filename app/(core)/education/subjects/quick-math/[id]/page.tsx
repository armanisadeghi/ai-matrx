// /education/subjects/quick-math/[id] — relocated individual algebra lesson.
// features/math service + MathProblem component unchanged; only the route moved.
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMathProblemById } from "@/features/math/service";
import MathProblem from "@/features/math/components/MathProblem";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const problem = await getMathProblemById(id);
    if (!problem) {
      return {
        title: "Math Problem Not Found - AI Matrx Education",
        description: "The requested math problem could not be found",
      };
    }
    const title = `${problem.title} | ${problem.topic_name} - AI Matrx Education`;
    const description =
      problem.description ||
      `Learn ${problem.title.toLowerCase()} in ${problem.topic_name}. Step-by-step algebraic problem solving with detailed explanations.`;
    return {
      title,
      description,
      keywords: [
        problem.topic_name,
        problem.module_name,
        "algebra",
        "mathematics",
        "math education",
        "step-by-step solutions",
        "learn math",
        problem.difficulty_level || "educational",
      ].join(", "),
      openGraph: { title, description, type: "article", siteName: "AI Matrx Education" },
      twitter: { card: "summary_large_image", title, description },
      alternates: { canonical: `/education/subjects/quick-math/${id}` },
    };
  } catch (error) {
    console.error("Error generating metadata:", error);
    return {
      title: "Math Problem - AI Matrx Education",
      description: "Interactive math problem solving platform",
    };
  }
}

export default async function QuickMathProblemPage({ params }: PageProps) {
  const { id } = await params;
  const problem = await getMathProblemById(id);
  if (!problem) notFound();

  const problemProps = {
    id: problem.id,
    title: problem.title,
    course_name: problem.course_name,
    topic_name: problem.topic_name,
    module_name: problem.module_name,
    description: problem.description,
    intro_text: problem.intro_text,
    final_statement: problem.final_statement,
    problem_statement: problem.problem_statement,
    solutions: problem.solutions,
  };

  return (
    <div className="min-h-full bg-textured">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="h-[calc(100dvh-8rem)] flex flex-col">
          <MathProblem {...problemProps} />
        </div>
      </div>
    </div>
  );
}
