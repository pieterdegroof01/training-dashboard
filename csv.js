'use strict';

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (/["\r\n,]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(rows, columns) {
  const lines = [columns.map((c) => escapeCell(c.label)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(row[c.key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

module.exports = { toCsv, escapeCell };
