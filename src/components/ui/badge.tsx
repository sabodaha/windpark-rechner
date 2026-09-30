import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium [&_svg]:size-3.5", {
  variants: {
    variant: {
      neutral: "bg-secondary text-foreground",
      good: "bg-good/10 text-good-text",
      warning: "bg-warning/15 text-foreground",
      critical: "bg-critical/10 text-critical",
      outline: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
