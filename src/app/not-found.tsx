import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PATHS } from "@/lib/site";
import { en } from "@/messages/en";

const t = en.site.notFound;

export const metadata: Metadata = { title: t.title, robots: { index: false } };

export default function NotFound() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-20 sm:px-6">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t.title}</h1>
      <p className="mt-3 text-muted-foreground">{t.text}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href={PATHS.home}>{t.home}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={PATHS.calculator}>{t.calculator}</Link>
        </Button>
      </div>
    </section>
  );
}
