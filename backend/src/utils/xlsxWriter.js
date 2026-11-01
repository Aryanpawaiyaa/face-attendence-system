/**
 * Streams `{ headers, rows }` report tables to the response as an
 * .xlsx workbook, using exceljs's `stream.xlsx.WorkbookWriter`.
 *
 * The WorkbookWriter serializes each row to the underlying stream as
 * it's added (and `.commit()`ed) rather than assembling the whole
 * workbook in memory and writing it out in one shot, so large report
 * exports don't get buffered as a complete file before any bytes
 * reach the client — mirroring how csvWriter.js streams CSV rows.
 */

const ExcelJS = require('exceljs');

/** Sets the response headers for an XLSX file download. */
function setXlsxHeaders(res, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

const MIN_WIDTH = 10;
const MAX_WIDTH = 40;
const WIDTH_PADDING = 2;

/**
 * Computes a reasonable column width per header, based on the header
 * text and the string length of every cell in that column, capped to
 * a sane range so one long outlier doesn't blow out the sheet.
 */
function computeColumnWidths(headers, rows) {
  const widths = headers.map((h) => String(h ?? '').length);
  for (const row of rows) {
    for (let i = 0; i < headers.length; i += 1) {
      const value = row[i];
      if (value === null || value === undefined) continue;
      const str = value instanceof Date ? value.toISOString() : String(value);
      if (str.length > widths[i]) widths[i] = str.length;
    }
  }
  return widths.map((w) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w + WIDTH_PADDING)));
}

/**
 * Convenience one-shot helper: sets headers and streams a
 * `{ headers, rows }` table to the response as an XLSX workbook,
 * with a single worksheet, bold header row, and auto-sized columns.
 */
async function streamXlsx(res, filename, table, sheetName = 'Report') {
  setXlsxHeaders(res, filename);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
    useSharedStrings: true,
  });
  workbook.creator = 'Smart Attendance System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }], // keep the header row visible while scrolling
  });

  // Widths only (no `header`/`key`) so exceljs doesn't auto-insert its
  // own header row on top of the one we write & style below.
  worksheet.columns = computeColumnWidths(table.headers, table.rows).map((width) => ({ width }));

  const headerRow = worksheet.addRow(table.headers);
  headerRow.font = { bold: true };
  headerRow.commit();

  for (const row of table.rows) {
    worksheet.addRow(row).commit();
  }

  worksheet.commit();
  await workbook.commit();
}

/** Builds a timestamped, filesystem-safe filename for a report export. */
function buildXlsxFilename(prefix) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}-${stamp}.xlsx`;
}

module.exports = { setXlsxHeaders, streamXlsx, buildXlsxFilename };
