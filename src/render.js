'use strict';
// Markdown to HTML with per-block text direction. No editor dependency, so it can be tested with plain node.
const MarkdownIt = require('markdown-it');
const taskLists = require('markdown-it-task-lists');

const RTL_LETTER = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const ANY_LETTER = /\p{L}/gu;
const RTL_SHARE = 0.3; // a block is RTL when at least this share of its letters are RTL

function countLetters(text, totals) {
  for (const ch of text.match(ANY_LETTER) || []) {
    if (RTL_LETTER.test(ch)) totals.rtl++;
    else totals.ltr++;
  }
}

function directionOf(totals) {
  const all = totals.rtl + totals.ltr;
  if (!all) return null;
  return totals.rtl / all >= RTL_SHARE ? 'rtl' : 'ltr';
}

// Only plain text counts: inline code and URLs must not turn a Persian line into LTR.
function countInline(token, totals) {
  for (const child of token.children || []) {
    if (child.type === 'text') countLetters(child.content, totals);
  }
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

function headingIds(state) {
  const seen = new Map();
  state.tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return;
    const inline = state.tokens[i + 1];
    const text = (inline.children || [])
      .filter((c) => c.type === 'text' || c.type === 'code_inline')
      .map((c) => c.content)
      .join('');
    const base = slugify(text) || 'section';
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    token.attrSet('id', n ? `${base}-${n}` : base);
  });
}

// Direction is set on top-level blocks; nested content inherits, so a list or table stays one direction.
function blockDirections(state) {
  const docTotals = { rtl: 0, ltr: 0 };
  const tokens = state.tokens;
  let i = 0;
  while (i < tokens.length) {
    const open = tokens[i];
    if (open.level === 0 && open.nesting === 1) {
      const totals = { rtl: 0, ltr: 0 };
      let j = i + 1;
      while (!(tokens[j].level === 0 && tokens[j].nesting === -1)) {
        if (tokens[j].type === 'inline') countInline(tokens[j], totals);
        j++;
      }
      const dir = directionOf(totals);
      if (dir && state.env.mode === 'auto') open.attrSet('dir', dir);
      docTotals.rtl += totals.rtl;
      docTotals.ltr += totals.ltr;
      i = j + 1;
    } else {
      i++;
    }
  }
  state.env.docDir = directionOf(docTotals) || 'ltr';
}

const md = new MarkdownIt({ html: true, linkify: true, breaks: true });
md.use(taskLists, { enabled: false });
md.core.ruler.push('hit_heading_ids', headingIds);
md.core.ruler.push('hit_block_dirs', blockDirections);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const IMG_SRC = /(<img\b[^>]*?\ssrc=)(["'])(.*?)\2/gi;

/**
 * @param {string} text Markdown source
 * @param {{mode?: 'auto'|'rtl'|'ltr', resolveImage?: (src: string) => string}} options
 * @returns {{html: string, dir: 'rtl'|'ltr'}}
 */
function render(text, options = {}) {
  const mode = options.mode || 'auto';
  let source = text.replace(/^﻿/, '');
  let prefix = '';

  const fm = FRONTMATTER.exec(source);
  if (fm) {
    source = source.slice(fm[0].length);
    prefix = `<details class="frontmatter" dir="ltr"><summary>Frontmatter</summary><pre><code>${md.utils.escapeHtml(fm[1])}</code></pre></details>`;
  }

  const env = { mode };
  let html = md.render(source, env);
  if (options.resolveImage) {
    html = html.replace(IMG_SRC, (all, head, quote, src) => `${head}${quote}${options.resolveImage(src)}${quote}`);
  }
  return { html: prefix + html, dir: mode === 'auto' ? env.docDir : mode };
}

module.exports = { render };
