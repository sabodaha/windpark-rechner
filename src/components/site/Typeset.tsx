import { cloneElement, isValidElement, type ReactNode } from "react";
import { nbsp } from "@/lib/typography";

/** Adjacent texts as one string, so "{num(x)} MW" is typeset like "6,3 MW". */
function mergeTexts(nodes: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (const n of nodes) {
    const text = typeof n === "string" || typeof n === "number" ? String(n) : null;
    const last = out.length - 1;
    if (text !== null && last >= 0 && typeof out[last] === "string") out[last] = `${out[last] as string}${text}`;
    else out.push(text ?? n);
  }
  return out;
}

/**
 * German no-break spaces (lib/typography) in every text of a tree written inline: plain elements and the children
 * of components such as Link. Text that a component builds from its other props (a table's rows) is not reached.
 */
export function typesetNode(node: ReactNode): ReactNode {
  if (typeof node === "string") return nbsp(node);
  if (Array.isArray(node)) return node.map(typesetNode);
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) {
    const children = node.props.children;
    // Children passed one by one keep needing no keys, as in the JSX they came from.
    return Array.isArray(children)
      ? cloneElement(node, undefined, ...mergeTexts(children).map(typesetNode))
      : cloneElement(node, undefined, typesetNode(children));
  }
  return node;
}

export function Typeset({ children }: { children: ReactNode }) {
  return <>{typesetNode(children)}</>;
}
