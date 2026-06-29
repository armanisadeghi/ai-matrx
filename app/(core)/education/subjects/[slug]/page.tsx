import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AxisDetail } from "@/features/education/components/AxisDetail";
import { getAxisEntry } from "@/features/education/data/registry";
import { axisDetailMetadata } from "@/features/education/route-helpers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return axisDetailMetadata("subjects", slug);
}

export default async function SubjectPage({ params }: Props) {
  const { slug } = await params;
  const entry = getAxisEntry("subjects", slug);
  if (!entry) notFound();
  return <AxisDetail axisId="subjects" entry={entry} />;
}
