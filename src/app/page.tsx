import Link from "next/link";

// Placeholder until the site pages are built (phase 4).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Igor Sabodakha</h1>
      <p className="text-muted-foreground">Project finance and valuation models.</p>
      <Link href="/wind-farm-calculator/" className="w-fit font-medium text-link hover:underline">
        Wind Farm Investment Calculator →
      </Link>
    </main>
  );
}
