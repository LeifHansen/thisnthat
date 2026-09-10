import React from "react";

// Minimal, dependency-free Markdown renderer for blog post bodies.
// Supports: ## / ### headings, "- " and "1." lists, blockquotes, paragraphs,
// and inline **bold**, *italic*, and [text](url) links. Everything is rendered
// as React elements (no dangerouslySetInnerHTML), so the output is XSS-safe
// even though content is admin-authored.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold**, *italic*, or [label](href). Order matters: bold before italic.
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>);
    } else if (m[4] !== undefined && m[5] !== undefined) {
      nodes.push(
        <a
          key={`${keyBase}-a${i}`}
          href={m[5]}
          target="_blank"
          rel="noopener noreferrer"
          className="!text-[var(--tnt-red)] underline"
        >
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function BlogContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];
  let key = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      const text = paragraph.join(" ");
      blocks.push(
        <p key={`p${key++}`} className="leading-relaxed text-[var(--tnt-ink-soft)]">
          {renderInline(text, `p${key}`)}
        </p>,
      );
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length) {
      const items = list.items.map((it, idx) => (
        <li key={idx}>{renderInline(it, `l${key}-${idx}`)}</li>
      ));
      blocks.push(
        list.ordered ? (
          <ol key={`ol${key++}`} className="list-decimal pl-6 space-y-1 text-[var(--tnt-ink-soft)]">
            {items}
          </ol>
        ) : (
          <ul key={`ul${key++}`} className="list-disc pl-6 space-y-1 text-[var(--tnt-ink-soft)]">
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(
        <blockquote
          key={`q${key++}`}
          className="border-l-4 border-[var(--tnt-line-strong)] pl-4 italic text-muted"
        >
          {renderInline(quote.join(" "), `q${key}`)}
        </blockquote>,
      );
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed === "") {
      flushAll();
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushAll();
      const level = h[1].length;
      const text = h[2];
      if (level <= 2) {
        blocks.push(
          <h2 key={`h${key++}`} className="font-display text-2xl !text-ink mt-2">
            {renderInline(text, `h${key}`)}
          </h2>,
        );
      } else {
        blocks.push(
          <h3 key={`h${key++}`} className="font-display text-xl !text-ink mt-2">
            {renderInline(text, `h${key}`)}
          </h3>,
        );
      }
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      flushQuote();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flushParagraph();
      flushQuote();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    const bq = /^>\s?(.*)$/.exec(trimmed);
    if (bq) {
      flushParagraph();
      flushList();
      quote.push(bq[1]);
      continue;
    }

    // Plain text line — part of a paragraph.
    flushList();
    flushQuote();
    paragraph.push(trimmed);
  }
  flushAll();

  return <div className="space-y-4">{blocks}</div>;
}
