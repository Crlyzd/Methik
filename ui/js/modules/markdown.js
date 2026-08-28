/**
 * Methik - Ultra-lightweight Vanilla JS Markdown Parser
 * Securely transforms Markdown/Plaintext into Frosted Glass HTML.
 */

/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses markdown inline formatting (bold, italic, code, links).
 * @param {string} text 
 * @returns {string}
 */
function parseInline(text) {
  let out = text;

  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold + Italic: ***text*** or ___text___
  out = out.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  out = out.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // Italic: *text* or _text_
  out = out.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // Links: [label](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
    return `<a class="md-link" href="#" onclick="App.openUrl('${url}'); return false;">${label}</a>`;
  });

  // Raw URLs (not already part of an <a> tag)
  out = out.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, (match, prefix, url) => {
    return `${prefix}<a class="md-link" href="#" onclick="App.openUrl('${url}'); return false;">${url}</a>`;
  });

  return out;
}

/**
 * Parses full Markdown string into formatted HTML structure.
 * @param {string} markdown 
 * @returns {string}
 */
export function renderMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') {
    return '<p class="md-empty">No changelog notes provided for this release.</p>';
  }

  // Pre-sanitize text
  const clean = escapeHtml(markdown.trim());
  const lines = clean.split(/\r?\n/);

  let html = [];
  let inList = false;
  let listType = 'ul'; // 'ul' or 'ol'
  let inCodeBlock = false;
  let codeBlockBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Code blocks ```
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        html.push(`<pre class="md-code-block"><code>${codeBlockBuffer.join('\n')}</code></pre>`);
        codeBlockBuffer = [];
        inCodeBlock = false;
      } else {
        // Start code block
        if (inList) {
          html.push(`</${listType}>`);
          inList = false;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockBuffer.push(rawLine);
      continue;
    }

    // Empty lines
    if (trimmed === '') {
      if (inList) {
        html.push(`</${listType}>`);
        inList = false;
      }
      continue;
    }

    // Horizontal Rule: --- or ***
    if (/^(\-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      if (inList) {
        html.push(`</${listType}>`);
        inList = false;
      }
      html.push('<hr class="md-hr">');
      continue;
    }

    // Headings: #, ##, ###, ####
    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      if (inList) {
        html.push(`</${listType}>`);
        inList = false;
      }
      const level = Math.min(headerMatch[1].length, 4);
      const content = parseInline(headerMatch[2]);
      html.push(`<h${level} class="md-h${level}">${content}</h${level}>`);
      continue;
    }

    // Blockquote: > text
    if (trimmed.startsWith('&gt;') || trimmed.startsWith('>')) {
      if (inList) {
        html.push(`</${listType}>`);
        inList = false;
      }
      const quoteText = parseInline(trimmed.replace(/^(&gt;|>)\s*/, ''));
      html.push(`<blockquote class="md-blockquote">${quoteText}</blockquote>`);
      continue;
    }

    // Bullet Lists: - item, * item, + item
    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push(`</${listType}>`);
        html.push('<ul class="md-list">');
        inList = true;
        listType = 'ul';
      }
      const itemContent = parseInline(bulletMatch[1]);
      html.push(`<li class="md-list-item">${itemContent}</li>`);
      continue;
    }

    // Numbered Lists: 1. item
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push(`</${listType}>`);
        html.push('<ol class="md-list-ol">');
        inList = true;
        listType = 'ol';
      }
      const itemContent = parseInline(numMatch[2]);
      html.push(`<li class="md-list-item">${itemContent}</li>`);
      continue;
    }

    // Regular Paragraph
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
    }
    const pContent = parseInline(trimmed);
    html.push(`<p class="md-p">${pContent}</p>`);
  }

  if (inCodeBlock) {
    html.push(`<pre class="md-code-block"><code>${codeBlockBuffer.join('\n')}</code></pre>`);
  }

  if (inList) {
    html.push(`</${listType}>`);
  }

  return html.join('');
}
