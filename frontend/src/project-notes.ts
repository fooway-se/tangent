export const DEFAULT_PROJECT_NOTES_MODE = 'preview' as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function safeLink(destination: string): string | null {
  const value = destination.trim();
  if (/^(?:https?:|mailto:)/i.test(value)) return value;
  if (/^(?:\/|\.\/|\.\.\/|#)/.test(value) && !/^\/\//.test(value)) return value;
  return null;
}

function renderInline(markdown: string): string {
  const tokenPattern = /\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let output = '';
  let cursor = 0;
  for (const match of markdown.matchAll(tokenPattern)) {
    const index = match.index ?? cursor;
    output += escapeHtml(markdown.slice(cursor, index));
    const [token, strongA, strongB, code, emphasisA, emphasisB, linkText, destination] = match;
    if (strongA !== undefined || strongB !== undefined) {
      output += `<strong>${escapeHtml(strongA ?? strongB ?? '')}</strong>`;
    } else if (code !== undefined) {
      output += `<code>${escapeHtml(code)}</code>`;
    } else if (emphasisA !== undefined || emphasisB !== undefined) {
      output += `<em>${escapeHtml(emphasisA ?? emphasisB ?? '')}</em>`;
    } else if (linkText !== undefined && destination !== undefined) {
      const href = safeLink(destination);
      output += href === null
        ? escapeHtml(token)
        : `<a href="${escapeHtml(href)}"${/^https?:/i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(linkText)}</a>`;
    } else {
      output += escapeHtml(token);
    }
    cursor = index + token.length;
  }
  output += escapeHtml(markdown.slice(cursor));
  return output;
}

export function renderMarkdown(markdown: string): string {
  const output: string[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];
  let codeLines: string[] | null = null;
  let codeLanguage = '';

  const flushParagraph = (): void => {
    if (paragraph.length > 0) output.push(`<p>${paragraph.map(renderInline).join(' ')}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (listType !== null) output.push(`<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    if (codeLines !== null) {
      if (/^\s*```\s*$/.test(line)) {
        const languageClass = /^[a-zA-Z0-9_-]+$/.test(codeLanguage) ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
        output.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
        codeLanguage = '';
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const fence = line.match(/^\s*```\s*([a-zA-Z0-9_-]*)\s*$/);
    if (fence !== null) {
      flushParagraph();
      flushList();
      codeLanguage = fence[1] ?? '';
      codeLines = [];
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading !== null) {
      flushParagraph();
      flushList();
      const level = heading[1]?.length ?? 1;
      output.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push('<hr>');
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote !== null) {
      flushParagraph();
      flushList();
      const quoteLines = [quote[1] ?? ''];
      let nextQuoteIndex = lineIndex + 1;
      while (nextQuoteIndex < lines.length) {
        const next = lines[nextQuoteIndex];
        const nextQuote = next?.match(/^\s*>\s?(.*)$/);
        if (nextQuote === null || nextQuote === undefined) break;
        quoteLines.push(nextQuote[1] ?? '');
        nextQuoteIndex += 1;
      }
      lineIndex = nextQuoteIndex - 1;
      output.push(`<blockquote><p>${quoteLines.map(renderInline).join(' ')}</p></blockquote>`);
      continue;
    }

    const item = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (item !== null) {
      flushParagraph();
      const nextType = item[2] === undefined ? 'ul' : 'ol';
      if (listType !== nextType) {
        flushList();
        listType = nextType;
      }
      listItems.push(item[3] ?? '');
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (codeLines !== null) {
    const languageClass = /^[a-zA-Z0-9_-]+$/.test(codeLanguage) ? ` class="language-${escapeHtml(codeLanguage)}"` : '';
    output.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return output.join('\n');
}
