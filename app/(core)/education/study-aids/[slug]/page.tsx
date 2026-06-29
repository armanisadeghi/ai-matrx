import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AxisDetail } from "@/features/education/components/AxisDetail";
import { getAxisEntry } from "@/features/education/data/registry";
import { axisDetailMetadata } from "@/features/education/route-helpers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return axisDetailMetadata("study-aids", slug);
}

export default async function StudyAidPage({ params }: Props) {
  const { slug } = await params;
  const entry = getAxisEntry("study-aids", slug);
  if (!entry) notFound();
  return <AxisDetail axisId="study-aids" entry={entry} />;
}
