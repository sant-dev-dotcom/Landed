import { Fragment, type ReactNode } from "react";

// Minimal, safe markdown renderer for AI text (summaries and chat answers):
// #, ##, ###, -, *, 1., **bold**, *italic*, `code` and [links](url). No raw HTML is ever rendered.

type LinkRenderer = (text: string, url: string, key: number) => ReactNode;

// Underscore emphasis only at word boundaries, so names like file_name stay plain.
const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(?<!\w)__([^_]+)__(?!\w)|\*([^*\s][^*]*)\*|(?<!\w)_([^_\s][^_]*)_(?!\w)|`([^`]+)`/g;

function inline(text: string, renderLink?: LinkRenderer): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const [, linkText, url, bold, bold2, em, em2, code] = m;
    if (linkText !== undefined) {
      // Without a renderer (e.g. print), a link shows as its words only.
      out.push(renderLink ? renderLink(linkText, url, key++) : <Fragment key={key++}>{linkText}</Fragment>);
    } else if (bold ?? bold2) {
      out.push(<strong key={key++}>{inline(bold ?? bold2, renderLink)}</strong>);
    } else if (em ?? em2) {
      out.push(<em key={key++}>{inline(em ?? em2, renderLink)}</em>);
    } else if (code !== undefined) {
      out.push(
        <code key={key++} className="rounded-[6px] bg-fill px-1.5 py-0.5 text-[0.9em]">
          {code}
        </code>
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return out;
}

export function Markdown({ text, renderLink, className = "" }: { text: string; renderLink?: LinkRenderer; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 ps-6`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, renderLink)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-*•]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "text-title2" : "text-title3 mt-1";
      blocks.push(
        level === 1 ? (
          <h3 key={blocks.length} className={cls}>
            {inline(h[2], renderLink)}
          </h3>
        ) : (
          <h4 key={blocks.length} className={cls}>
            {inline(h[2], renderLink)}
          </h4>
        )
      );
    } else {
      blocks.push(<p key={blocks.length}>{inline(line, renderLink)}</p>);
    }
  }
  flush();
  return (
    <div
      className={`flex flex-col gap-2.5 text-body text-label-soft [&_code]:text-label [&_h3]:text-label [&_h4]:text-label [&_strong]:font-medium [&_strong]:text-label ${className}`}
    >
      {blocks}
    </div>
  );
}
