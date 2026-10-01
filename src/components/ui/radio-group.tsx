"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * A row of buttons that works as one radio group (WAI-ARIA radio group pattern): a single tab stop on the chosen
 * option; the arrow keys move the choice, Home and End go to the first and last option.
 */
export function RadioGroup<T extends string>({
  value,
  options,
  onChange,
  label,
  labelledBy,
  className,
  optionClassName,
  render,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** The group's name, when no visible label can be referenced. */
  label?: string;
  /** Id of the visible label. */
  labelledBy?: string;
  className?: string;
  optionClassName: (checked: boolean) => string;
  render: (option: T) => ReactNode;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, options.indexOf(value));
  const choose = (to: number) => {
    const n = (to + options.length) % options.length;
    onChange(options[n]!);
    buttons.current[n]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") choose(i + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") choose(i - 1);
    else if (e.key === "Home") choose(0);
    else if (e.key === "End") choose(options.length - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} className={className}>
      {options.map((o, i) => (
        <button
          key={o}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o === value}
          tabIndex={i === current ? 0 : -1}
          onClick={() => onChange(o)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={optionClassName(o === value)}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}
