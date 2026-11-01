/**
 * Lightweight, dependency-free CSV writer that streams rows directly
 * to a writable stream (e.g. an Express `res` object).
 *
 * No external CSV package is used — this keeps the dependency
 * footprint of the report-export feature at zero.
 */

const NEEDS_QUOTING = /["\n\r,]/;

/** Escapes a single value per RFC 4180 (quote if it contains a comma,
 * quote, or newline; double up any embedded quotes). */
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (NEEDS_QUOTING.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToLine(row) {
  return `${row.map(escapeCsvValue).join(',')}\r\n`;
}

/**
 * Wraps a writable stream (res) and writes CSV rows to it incrementally,
 * so large report exports are streamed rather than buffered in memory
 * as one giant string.
 */
class CsvStreamWriter {
  constructor(stream, { headers } = {}) {
    this.stream = stream;
    this.headers = headers || null;
    this.headerWritten = false;
  }

  /** Writes the header row (once), if headers were supplied. */
  start() {
    if (this.headerWritten) return;
    this.headerWritten = true;
    if (this.headers && this.headers.length) {
      this.stream.write(rowToLine(this.headers));
    }
  }

  writeRow(row) {
    if (!this.headerWritten) this.start();
    this.stream.write(rowToLine(row));
  }

  writeRows(rows) {
    for (const row of rows) this.writeRow(row);
  }

  /** Ends the stream, ensuring the header line is emitted even for a
   * zero-row result set (so the client still gets a valid CSV file). */
  end() {
    if (!this.headerWritten) this.start();
    this.stream.end();
  }
}

/** Sets the response headers for a CSV file download. */
function setCsvHeaders(res, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
}

/**
 * Convenience one-shot helper: sets headers and streams a
 * `{ headers, rows }` table to the response as CSV.
 */
function streamCsv(res, filename, table) {
  setCsvHeaders(res, filename);
  const writer = new CsvStreamWriter(res, { headers: table.headers });
  writer.writeRows(table.rows);
  writer.end();
}

/** Builds a timestamped, filesystem-safe filename for a report export. */
function buildCsvFilename(prefix) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${prefix}-${stamp}.csv`;
}

module.exports = { CsvStreamWriter, setCsvHeaders, streamCsv, buildCsvFilename, escapeCsvValue };
