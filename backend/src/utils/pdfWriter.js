/**
 * Streams `{ headers, rows }` report tables to the response as a PDF
 * document, using pdfkit.
 *
 * Mirrors csvWriter.js / xlsxWriter.js: pdfkit's PDFDocument is a
 * Node Readable stream, so `.pipe(res)` writes bytes to the client as
 * the document is built rather than buffering the whole file in
 * memory first. A title, a "generated at" timestamp, and a summary of
 * the filters that were applied are rendered above the table, and the
 * table itself repeats its header row on every page it spans.
 */

const PDFDocument = require('pdfkit');

const PAGE_MARGIN = 40;
const ROW_HEIGHT = 18;
const MIN_COLUMN_WIDTH = 45;
// Above this many columns, landscape gives each column more room to
// stay readable before pdfkit starts truncating cell text.
const LANDSCAPE_COLUMN_THRESHOLD = 6;

const COLORS = {
  title: '#111827',
  subtitle: '#6b7280',
  sectionLabel: '#374151',
  tableHeaderBg: '#1f2937',
  tableHeaderText: '#ffffff',
  rowText: '#111827',
  zebra: '#f3f4f6',
  border: '#d1d5db',
  empty: '#6b7280',
};

/** Sets the response headers for a PDF file download. */
function setPdfHeaders(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

/** Builds a timestamped, filesystem-safe filename for a report export. */
function buildPdfFilename(prefix) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}-${stamp}.pdf`;
}

function cellToString(value) {
  if (value === null || value === undefined) return '';
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Turns a request-style query object into an ordered `{ label, value }`
 * list for the "Applied Filters" section, skipping only the `format`
 * flag itself (export-format plumbing, not a data filter) and any
 * parameter that wasn't actually supplied. `page`/`limit` are kept by
 * default: the underlying report services paginate their results, so
 * omitting them would let a PDF silently show only one page of a
 * larger dataset without saying so.
 */
function buildFilterEntries(query = {}, { exclude = ['format'], extra = [] } = {}) {
  const fromQuery = Object.entries(query || {})
    .filter(([key, value]) => !exclude.includes(key) && value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({ label: key, value: Array.isArray(value) ? value.join(', ') : String(value) }));
  return [...extra, ...fromQuery];
}

/** Distributes the available width across columns, proportional to each
 * column's widest content, then floors every column to a minimum
 * readable width and rebalances the excess from wider columns — so
 * narrow columns (e.g. "status") don't collapse, and the total never
 * exceeds `availableWidth` (which would otherwise push the table past
 * the page's right margin). */
function computeColumnWidths(headers, rows, availableWidth) {
  const weights = headers.map((h) => cellToString(h).length || 1);
  for (const row of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      const len = cellToString(row[i]).length;
      if (len > weights[i]) weights[i] = len;
    }
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  const widths = weights.map((w) => (w / totalWeight) * availableWidth);

  const floor = Math.min(MIN_COLUMN_WIDTH, availableWidth / headers.length);
  let deficit = 0;
  for (let i = 0; i < widths.length; i += 1) {
    if (widths[i] < floor) {
      deficit += floor - widths[i];
      widths[i] = floor;
    }
  }
  if (deficit > 0) {
    const aboveFloor = widths.map((w, i) => ({ i, slack: w - floor })).filter((c) => c.slack > 0);
    const totalSlack = aboveFloor.reduce((sum, c) => sum + c.slack, 0);
    if (totalSlack > 0) {
      aboveFloor.forEach((c) => {
        widths[c.i] -= deficit * (c.slack / totalSlack);
      });
    }
  }
  return widths;
}

/** Draws the table header row at (x, y) and returns the y just below it. */
function drawTableHeader(doc, headers, colWidths, x, y) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  doc.rect(x, y, totalWidth, ROW_HEIGHT).fill(COLORS.tableHeaderBg);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.tableHeaderText);
  let cx = x;
  headers.forEach((h, i) => {
    doc.text(cellToString(h), cx + 4, y + 5, { width: colWidths[i] - 8, height: ROW_HEIGHT - 6, ellipsis: true });
    cx += colWidths[i];
  });
  return y + ROW_HEIGHT;
}

/** Draws the full table body, paginating (with a repeated header row) whenever
 * a row would overflow the current page. */
function drawTable(doc, table) {
  const { headers, rows } = table;
  const x = doc.page.margins.left;
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  const colWidths = computeColumnWidths(headers, rows, availableWidth);

  let y = drawTableHeader(doc, headers, colWidths, x, doc.y);

  rows.forEach((row, idx) => {
    if (y + ROW_HEIGHT > bottomLimit) {
      doc.addPage();
      y = drawTableHeader(doc, headers, colWidths, x, doc.page.margins.top);
    }
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    if (idx % 2 === 1) {
      doc.rect(x, y, totalWidth, ROW_HEIGHT).fill(COLORS.zebra);
    }
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.rowText);
    let cx = x;
    row.forEach((cell, i) => {
      doc.text(cellToString(cell), cx + 4, y + 5, { width: colWidths[i] - 8, height: ROW_HEIGHT - 6, ellipsis: true });
      cx += colWidths[i];
    });
    y += ROW_HEIGHT;
  });

  doc.y = y;
}

/** Stamps "Page X of Y" at the bottom of every buffered page. */
function drawPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLORS.subtitle)
      .text(`Page ${i + 1 - range.start} of ${range.count}`, PAGE_MARGIN, doc.page.height - PAGE_MARGIN + 12, {
        width: doc.page.width - PAGE_MARGIN * 2,
        align: 'center',
      });
  }
}

/**
 * Convenience one-shot helper: sets headers and streams a
 * `{ headers, rows }` table to the response as a PDF, with a title,
 * generation timestamp, applied-filters summary, and a paginated table.
 * Empty datasets render a friendly "no records" message instead of an
 * empty/broken table.
 */
function streamPdf(res, filename, table, { title = 'Report', filters = [] } = {}) {
  setPdfHeaders(res, filename);

  const useLandscape = (table.headers || []).length > LANDSCAPE_COLUMN_THRESHOLD;
  const doc = new PDFDocument({
    margin: PAGE_MARGIN,
    size: 'A4',
    layout: useLandscape ? 'landscape' : 'portrait',
    bufferPages: true,
    info: { Title: title, Creator: 'Smart Attendance System' },
  });
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.title).text(title);
  doc.moveDown(0.25);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(COLORS.subtitle)
    .text(`Generated: ${new Date().toISOString()}`);

  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.sectionLabel).text('Applied Filters');
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.rowText);
  if (filters.length) {
    doc.text(filters.map((f) => `${f.label}: ${f.value}`).join('    |    '), {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    });
  } else {
    doc.fillColor(COLORS.empty).text('None');
  }

  doc.moveDown(1);

  if (!table.rows.length) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(COLORS.empty).text('No records found for the selected filters.');
  } else {
    drawTable(doc, table);
  }

  drawPageNumbers(doc);
  doc.end();
}

module.exports = { setPdfHeaders, streamPdf, buildPdfFilename, buildFilterEntries };
