import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AxisDetail } from "@/features/education/components/AxisDetail";
import { getAxisEntry } from "@/features/education/data/registry";
import { axisDetailMetadata } from "@/features/education/route-helpers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return axisDetailMetadata("exam-prep", slug);
}

export default async function ExamPage({ params }: Props) {
  const { slug } = await params;
  const entry = getAxisEntry("exam-prep", slug);
  if (!entry) notFound();
  return <AxisDetail axisId="exam-prep" entry={entry} />;
}
