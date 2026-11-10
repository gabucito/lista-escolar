/** Preserve the worksheet row number while omitting entirely empty data rows. */
export function spreadsheetRows(rows: readonly (readonly string[])[], hasHeader: boolean) {
  return rows
    .map((cells, index) => ({ cells, source_row: index + 1 }))
    .slice(hasHeader ? 1 : 0)
    .filter((row) => row.cells.some((cell) => cell.trim().length > 0));
}
