import { quantityIssue, steppedQuantity } from './editor-workspace';

describe('Editor quantity controls', () => {
  it('increments measured decimal-comma quantities exactly without converting units', () => {
    expect(steppedQuantity('1,001', 'm', 1)).toBe('2.001');
    expect(steppedQuantity('2.001', 'm', -1)).toBe('1.001');
    expect(steppedQuantity('2', 'caja', 1)).toBe('3');
  });

  it('preserves invalid or ambiguous quantities so the user can correct them', () => {
    for (const value of ['1,000.5', '1.2345', 'texto', '']) {
      expect(quantityIssue(value, 'm')).not.toBe('');
      expect(steppedQuantity(value, 'm', 1)).toBe(value);
    }
    expect(quantityIssue('1,5', 'caja')).toContain('entero');
    expect(steppedQuantity('1,5', 'caja', 1)).toBe('1,5');
  });

  it('retains the allowed bounds and never steps down to zero', () => {
    expect(steppedQuantity('1', 'unidad', -1)).toBe('1');
    expect(steppedQuantity('0.001', 'm', -1)).toBe('0.001');
    expect(steppedQuantity('9999', 'unidad', 1)).toBe('9999');
    expect(steppedQuantity('9999,999', 'm', 1)).toBe('9999,999');
    expect(quantityIssue('9999,999', 'm')).toBe('');
    expect(quantityIssue('10000', 'm')).not.toBe('');
    expect(quantityIssue('1', 'docena')).not.toBe('');
  });
});
