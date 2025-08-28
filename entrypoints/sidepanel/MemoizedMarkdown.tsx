import { marked } from 'marked';
import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownBlock {
  id: string;
  content: string;
}

function parseMarkdownIntoBlocks(markdown: string): MarkdownBlock[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token, index) => ({
    id: `token-${index}-${token.raw.slice(0, 20).replace(/\W/g, '')}-${token.raw.length}`,
    content: token.raw,
  }));
}

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    return <ReactMarkdown>{content}</ReactMarkdown>;
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    return true;
  },
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

export const MemoizedMarkdown = memo(({ content, id }: { content: string; id: string }) => {
  const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

  return (
    <>
      {blocks.map((block) => (
        <MemoizedMarkdownBlock content={block.content} key={`${id}-${block.id}`} />
      ))}
    </>
  );
});

MemoizedMarkdown.displayName = 'MemoizedMarkdown';
