import { MarkdownEditor } from '@nkzw/mdx-editor';
import type { ComponentProps, ReactNode } from 'react';
import { Suspense, useMemo } from 'react';
import { renderInlineMarkdown } from '../../lib/markdown.tsx';

type MarkdownEditorProps = ComponentProps<typeof MarkdownEditor>;

type MarkdownDetailsPart = {
  body: string;
  open: boolean;
  summary: string;
  type: 'details';
};

type MarkdownTextPart = {
  type: 'markdown';
  value: string;
};

type MarkdownPart = MarkdownDetailsPart | MarkdownTextPart;

const detailsBlockPattern =
  /<details\b([^>]*)>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi;
const htmlCommentPattern = /<!--[\s\S]*?-->/g;

const hasOpenAttribute = (attributes: string) =>
  /(?:^|\s)open(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?:\s|$)/i.test(attributes);
const stripHtmlComments = (value: string) => value.replaceAll(htmlCommentPattern, '');
const getFenceMarker = (line: string) => {
  const match = /^(?: {0,3})(`{3,}|~{3,})/.exec(line);
  return match?.[1] ?? null;
};

export const normalizeReadOnlyMarkdownValue = (value: string) => {
  const normalizedLineEndings = value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const preserveSingleTrailingNewline =
    /\n$/.test(normalizedLineEndings) && !/\n[ \t]*\n[ \t]*$/.test(normalizedLineEndings);
  const lines = normalizedLineEndings.split('\n');
  const normalizedLines: Array<string> = [];
  let pendingBlankLine = false;
  let fenceMarker: string | null = null;

  for (const line of lines) {
    const currentFenceMarker = getFenceMarker(line);

    if (fenceMarker) {
      normalizedLines.push(line);
      if (
        currentFenceMarker?.startsWith(fenceMarker[0]!) &&
        currentFenceMarker.length >= fenceMarker.length
      ) {
        fenceMarker = null;
      }
      continue;
    }

    if (!line.trim()) {
      pendingBlankLine = true;
      continue;
    }

    if (pendingBlankLine && normalizedLines.length > 0) {
      normalizedLines.push('');
    }
    pendingBlankLine = false;
    normalizedLines.push(line);

    if (currentFenceMarker) {
      fenceMarker = currentFenceMarker;
    }
  }

  const normalizedValue = normalizedLines.join('\n');
  return preserveSingleTrailingNewline && normalizedValue
    ? `${normalizedValue}\n`
    : normalizedValue;
};

const parseMarkdownDetails = (value: string): Array<MarkdownPart> => {
  const parts: Array<MarkdownPart> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = detailsBlockPattern.exec(value))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'markdown', value: value.slice(lastIndex, match.index) });
    }

    parts.push({
      body: match[3] ?? '',
      open: hasOpenAttribute(match[1] ?? ''),
      summary: stripHtmlComments(match[2] ?? '').trim(),
      type: 'details',
    });
    lastIndex = detailsBlockPattern.lastIndex;
  }

  if (lastIndex < value.length) {
    parts.push({ type: 'markdown', value: value.slice(lastIndex) });
  }

  return parts;
};

const hasDetailsBlock = (parts: ReadonlyArray<MarkdownPart>) =>
  parts.some((part) => part.type === 'details');

function MarkdownSegment({
  additionalPlugins,
  ariaLabel,
  contentClassName,
  editorClassName,
  onHeightChange,
  value,
}: {
  additionalPlugins?: MarkdownEditorProps['additionalPlugins'];
  ariaLabel: string;
  contentClassName?: string;
  editorClassName?: string;
  onHeightChange?: (height: number) => void;
  value: string;
}) {
  const normalizedValue = normalizeReadOnlyMarkdownValue(value);
  if (!normalizedValue.trim()) {
    return null;
  }

  return (
    <div className="codiff-safe-markdown-segment">
      <MarkdownEditor
        additionalPlugins={additionalPlugins}
        ariaLabel={ariaLabel}
        className={`codiff-readonly-markdown-editor${editorClassName ? ` ${editorClassName}` : ''}`}
        colorScheme="inherit"
        contentClassName={contentClassName}
        density="compact"
        onHeightChange={onHeightChange}
        readOnly
        spellCheck={false}
        suppressHtmlProcessing
        value={normalizedValue}
        variant="embedded"
      />
    </div>
  );
}

function MarkdownParts({
  additionalPlugins,
  ariaLabel,
  contentClassName,
  editorClassName,
  onHeightChange,
  parts,
}: {
  additionalPlugins?: MarkdownEditorProps['additionalPlugins'];
  ariaLabel: string;
  contentClassName?: string;
  editorClassName?: string;
  onHeightChange?: (height: number) => void;
  parts: ReadonlyArray<MarkdownPart>;
}) {
  return parts.map((part, index) => {
    if (part.type === 'markdown') {
      return (
        <MarkdownSegment
          additionalPlugins={additionalPlugins}
          ariaLabel={ariaLabel}
          contentClassName={contentClassName}
          editorClassName={editorClassName}
          key={`markdown:${index}`}
          onHeightChange={onHeightChange}
          value={part.value}
        />
      );
    }

    return (
      <details
        className="codiff-markdown-details"
        key={`details:${index}`}
        onToggle={(event) => onHeightChange?.(event.currentTarget.getBoundingClientRect().height)}
        open={part.open}
      >
        <summary>{renderInlineMarkdown(part.summary || 'Details')}</summary>
        <MarkdownParts
          additionalPlugins={additionalPlugins}
          ariaLabel={`${ariaLabel} details`}
          contentClassName={contentClassName}
          editorClassName={editorClassName}
          onHeightChange={onHeightChange}
          parts={parseMarkdownDetails(part.body)}
        />
      </details>
    );
  });
}

export function ReadOnlyMarkdownView({
  additionalPlugins,
  ariaLabel,
  className,
  contentClassName,
  density = 'document',
  fallback,
  onHeightChange,
  value,
  variant = 'plain',
}: {
  additionalPlugins?: MarkdownEditorProps['additionalPlugins'];
  ariaLabel: string;
  className: string;
  contentClassName?: string;
  density?: MarkdownEditorProps['density'];
  fallback?: ReactNode;
  onHeightChange?: (height: number) => void;
  value: string;
  variant?: MarkdownEditorProps['variant'];
}) {
  const normalizedValue = useMemo(() => normalizeReadOnlyMarkdownValue(value), [value]);
  const parts = useMemo(() => parseMarkdownDetails(normalizedValue), [normalizedValue]);

  if (!hasDetailsBlock(parts)) {
    if (!normalizedValue.trim()) {
      return null;
    }

    return (
      <Suspense
        fallback={
          fallback ?? (
            <div className={`${className} codiff-readonly-markdown-loading`}>Loading…</div>
          )
        }
      >
        <div className={className}>
          <MarkdownEditor
            additionalPlugins={additionalPlugins}
            ariaLabel={ariaLabel}
            className={`codiff-readonly-markdown-editor ${className}`}
            colorScheme="inherit"
            contentClassName={contentClassName}
            density={density}
            onHeightChange={onHeightChange}
            readOnly
            spellCheck={false}
            suppressHtmlProcessing
            value={normalizedValue}
            variant={variant}
          />
        </div>
      </Suspense>
    );
  }

  return (
    <Suspense
      fallback={
        fallback ?? <div className={`${className} codiff-readonly-markdown-loading`}>Loading…</div>
      }
    >
      <div aria-label={ariaLabel} className={`${className} codiff-safe-markdown-view`}>
        <MarkdownParts
          additionalPlugins={additionalPlugins}
          ariaLabel={ariaLabel}
          contentClassName={contentClassName}
          editorClassName={className}
          onHeightChange={onHeightChange}
          parts={parts}
        />
      </div>
    </Suspense>
  );
}
