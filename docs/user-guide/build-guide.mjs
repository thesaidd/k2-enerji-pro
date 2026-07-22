import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const guideDirectory = dirname(fileURLToPath(import.meta.url));
const markdownPath = resolve(
  guideDirectory,
  'K2_EnerjiPro_3.0.3_Kullanici_Rehberi.md',
);
const htmlPath = resolve(
  guideDirectory,
  'K2_EnerjiPro_3.0.3_Kullanici_Rehberi.html',
);

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const slugCounts = new Map();

const slugify = (value) => {
  const base = value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'bolum';
  const count = slugCounts.get(base) ?? 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
};

const renderInline = (source) => {
  const tokens = [];
  const preserve = (html) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let value = source.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, src) => preserve(
      `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
    ),
  );
  value = value.replace(/`([^`]+)`/g, (_, code) => preserve(`<code>${escapeHtml(code)}</code>`));
  value = value.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, href) => preserve(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`),
  );
  value = escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/ {2}$/g, '<br>');

  return value.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
};

const isTableDivider = (line) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const tableCells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isBlockStart = (lines, index) => {
  const line = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  return (
    line.trim() === '' ||
    /^#{1,4}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^---+$/.test(line.trim()) ||
    /^!\[[^\]]*\]\([^)]+\)\s*$/.test(line.trim()) ||
    (line.includes('|') && isTableDivider(next))
  );
};

const renderMarkdown = (markdown) => {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const headings = [];
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].trim();
      const id = slugify(title.replace(/[*`]/g, ''));
      headings.push({ level, title: title.replace(/[*`]/g, ''), id });
      html.push(`<h${level} id="${id}">${renderInline(title)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      html.push(
        `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`,
      );
      continue;
    }

    if (line.includes('|') && isTableDivider(lines[index + 1] ?? '')) {
      const headers = tableCells(line);
      const rows = [];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      html.push('<div class="table-wrap"><table><thead><tr>');
      html.push(headers.map((cell) => `<th>${renderInline(cell)}</th>`).join(''));
      html.push('</tr></thead><tbody>');
      for (const row of rows) {
        html.push(`<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`);
      }
      html.push('</tbody></table></div>');
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      html.push(`<blockquote>${renderInline(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*]\s+/, '');
        const task = /^\[([ xX])\]\s+/.exec(item);
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          items.push(
            `<li class="task"><span class="checkbox${checked ? ' checked' : ''}">${checked ? '✓' : ''}</span>${renderInline(item.replace(/^\[[ xX]\]\s+/, ''))}</li>`,
          );
        } else {
          items.push(`<li>${renderInline(item)}</li>`);
        }
        index += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (/^!\[[^\]]*\]\([^)]+\)\s*$/.test(line.trim())) {
      html.push(renderInline(line.trim()));
      index += 1;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
  }

  return { html: html.join('\n'), headings };
};

const markdown = await readFile(markdownPath, 'utf8');
const firstDivider = markdown.indexOf('\n---\n');
const bodyMarkdown = firstDivider >= 0 ? markdown.slice(firstDivider + 5) : markdown;
const { html: renderedBody, headings } = renderMarkdown(bodyMarkdown);
const tableOfContents = headings
  .filter(({ level }) => level === 2 || level === 3)
  .map(
    ({ level, title, id }) =>
      `<li class="toc-level-${level}"><a href="#${id}">${escapeHtml(title)}</a></li>`,
  )
  .join('\n');

const documentHtml = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="docs/user-guide/build-guide.mjs">
  <title>K2 EnerjiPro 3.0.3 — Kullanıcı Rehberi</title>
  <style>
    :root { color-scheme: light; --ink: #18212f; --muted: #5d6878; --line: #d9e0e8; --soft: #f3f7fa; --brand: #124e78; --accent: #f5a623; }
    @page { size: A4; margin: 18mm 16mm 18mm; @top-left { content: "K2 EnerjiPro 3.0.3 · Demo"; color: #667386; font: 8pt Arial, sans-serif; } @top-right { content: "Kullanıcı Rehberi"; color: #667386; font: 8pt Arial, sans-serif; } @bottom-center { content: "K2 EnerjiPro 3.0.3 · Kullanıcı Rehberi  |  " counter(page) " / " counter(pages); color: #667386; font: 8pt Arial, sans-serif; } }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0 auto; max-width: 210mm; color: var(--ink); background: white; font: 10.3pt/1.52 Arial, "Segoe UI", sans-serif; }
    main { padding: 0; }
    .cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; break-after: page; }
    .cover .eyebrow { color: var(--brand); font-size: 11pt; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .cover h1 { margin: 10mm 0 2mm; border: 0; color: var(--ink); font-size: 29pt; line-height: 1.08; }
    .cover h2 { margin: 0 0 8mm; color: var(--brand); font-size: 20pt; }
    .cover .meta { color: var(--muted); font-size: 10.5pt; }
    .cover .notice { margin: 8mm auto 6mm; max-width: 165mm; padding: 4mm 6mm; border-left: 4px solid var(--accent); background: #fff7e8; text-align: left; }
    .cover img { width: 162mm; max-height: 92mm; object-fit: contain; border: 1px solid var(--line); border-radius: 3mm; box-shadow: 0 2mm 7mm rgba(21, 40, 58, .12); }
    .document-control { margin: 0 0 8mm; padding: 4mm 5mm; border: 1px solid var(--line); background: var(--soft); color: var(--muted); font-size: 9pt; }
    h1, h2, h3, h4 { break-after: avoid-page; page-break-after: avoid; }
    h2 { margin: 10mm 0 3mm; padding-bottom: 2mm; border-bottom: 1.5px solid var(--brand); color: var(--brand); font-size: 17pt; }
    h3 { margin: 7mm 0 2mm; color: #233b54; font-size: 13pt; }
    h4 { margin: 5mm 0 1.5mm; color: #32465c; font-size: 11pt; }
    p { margin: 0 0 3.5mm; orphans: 3; widows: 3; }
    a { color: var(--brand); text-decoration: none; }
    ul, ol { margin: 1.5mm 0 4mm 6mm; padding-left: 5mm; }
    li { margin: 0 0 1.6mm; }
    blockquote { margin: 4mm 0; padding: 3mm 5mm; border-left: 4px solid var(--accent); background: #fff8eb; color: #3a4655; break-inside: avoid; }
    code { padding: .2mm 1mm; border-radius: 1mm; background: #edf2f6; font: 9pt Consolas, monospace; }
    pre { overflow-wrap: anywhere; white-space: pre-wrap; padding: 4mm; border: 1px solid var(--line); background: #18212f; color: #f6f8fb; break-inside: avoid; }
    pre code { padding: 0; background: transparent; color: inherit; }
    hr { margin: 8mm 0; border: 0; border-top: 1px solid var(--line); }
    figure { margin: 5mm 0 7mm; text-align: center; break-inside: avoid-page; page-break-inside: avoid; }
    figure img { display: block; width: 100%; max-height: 163mm; margin: 0 auto; object-fit: contain; border: 1px solid var(--line); border-radius: 2mm; box-shadow: 0 1.5mm 5mm rgba(21, 40, 58, .11); }
    figcaption { margin-top: 2mm; color: var(--muted); font-size: 8.8pt; font-style: italic; }
    .table-wrap { margin: 3mm 0 5mm; }
    table { width: 100%; border-collapse: collapse; font-size: 8.9pt; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 2mm 2.4mm; border: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { background: #dfeef7; color: #193950; font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .toc { columns: 2; column-gap: 10mm; margin-bottom: 8mm; }
    .toc li { break-inside: avoid; margin-bottom: 1.5mm; list-style: none; }
    .toc-level-3 { padding-left: 4mm; font-size: 9pt; }
    .checkbox { display: inline-block; width: 3.5mm; height: 3.5mm; margin-right: 2mm; border: 1px solid #607086; line-height: 3.2mm; text-align: center; }
    .checkbox.checked { background: var(--brand); color: white; }
    .task { list-style: none; margin-left: -5mm; }
    .page-break { break-before: page; page-break-before: always; }
    @media screen { body { padding: 12mm 16mm; box-shadow: 0 0 18px rgba(21, 40, 58, .16); } }
    @media print { body { max-width: none; } a { color: inherit; } }
  </style>
</head>
<body>
  <main>
    <section class="cover">
      <div class="eyebrow">Kanıtlı demo dokümantasyonu</div>
      <h1>K2 EnerjiPro 3.0.3</h1>
      <h2>Kullanıcı Rehberi</h2>
      <div class="meta"><strong>Demo sürümü</strong><br>22 Temmuz 2026<br>Satış · Finans · Risk · Teklif ekipleri</div>
      <div class="notice">K2 EnerjiPro 3.0.3 demo sürümü resmî fatura veya muhasebe sistemi değildir. Sonuçlar karar desteği ve ürün demosu amacıyla kullanılmalıdır.</div>
      <img src="screenshots/01-dashboard-empty.png" alt="Boş başlangıç gösterge paneli">
    </section>
    <section class="document-control">
      <strong>Belge kaynağı:</strong> K2_EnerjiPro_3.0.3_Kullanici_Rehberi.md ·
      <strong>Uygulama:</strong> 3.0.3 · <strong>Hesaplama politikası:</strong> K2-ENERJIPRO-3.0.0 ·
      <strong>Backup schema:</strong> v2
    </section>
    <section>
      <h2>İçindekiler</h2>
      <ol class="toc">${tableOfContents}</ol>
    </section>
    ${renderedBody}
  </main>
</body>
</html>
`;

await writeFile(htmlPath, documentHtml, 'utf8');
console.log(`HTML üretildi: ${htmlPath}`);
