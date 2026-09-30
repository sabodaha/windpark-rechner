import type { Metadata } from "next";
import { Calculator } from "@/components/calculator/Calculator";
import { en } from "@/messages/en";

export const metadata: Metadata = {
  title: en.meta.title,
  description: en.meta.description,
};

// The calculator is a client component, but it is rendered at build time with the base case, so the
// static HTML already contains the KPIs, charts and tables.
export default function WindFarmCalculatorPage() {
  return <Calculator />;
}
