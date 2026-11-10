import { spreadsheetRows } from './import-rows';

describe('Spreadsheet review rows', () => {
  it('skips empty and whitespace-only rows without changing original worksheet indices', () => {
    const rows = spreadsheetRows(
      [
        ['Nombre', 'Cantidad', 'Nota'],
        ['', '', ''],
        ['Cuaderno', '2', ''],
        ['  ', '\t', '\u00a0'],
        [],
        ['Regla', '1', '30 cm'],
      ],
      true,
    );
    expect(rows.map((row) => row.source_row)).toEqual([3, 6]);
    expect(rows.map((row) => row.cells[0])).toEqual(['Cuaderno', 'Regla']);
  });

  it('retains rows with a blank name but another populated cell for manual correction', () => {
    const rows = spreadsheetRows(
      [
        ['', '2'],
        ['', '', 'Revisar útil'],
        ['Lápiz', '1'],
      ],
      false,
    );
    expect(rows.map((row) => row.source_row)).toEqual([1, 2, 3]);
  });
});
