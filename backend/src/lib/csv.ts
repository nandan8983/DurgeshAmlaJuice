/** Minimal CSV writer for the report exports. */
import type { Response } from 'express';

type Cell = string | number | boolean | null | undefined | Date;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  const raw = value instanceof Date ? value.toISOString() : String(value);
  // Quote when the value contains a delimiter, a quote or a newline.
  // The leading-character guard stops spreadsheets treating a value as a formula.
  const needsQuotes = /[",\n\r]/.test(raw);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T extends Record<string, Cell>>(
  rows: readonly T[],
  columns?: ReadonlyArray<keyof T & string>,
): string {
  const cols = columns ?? (rows.length > 0 ? (Object.keys(rows[0] as object) as Array<keyof T & string>) : []);
  const header = cols.map((c) => escapeCell(c)).join(',');
  const body = rows.map((row) => cols.map((c) => escapeCell(row[c])).join(','));
  return [header, ...body].join('\r\n');
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // BOM so Excel on Windows reads UTF-8 names correctly.
  res.send(`﻿${csv}`);
}
