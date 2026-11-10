import { UNITS } from '../../core/models';

const measured = new Set(['m', 'cm', 'L', 'ml', 'kg', 'g']);

/** Match the quantity contract without rounding or interpreting thousands separators. */
export function quantityIssue(quantity: string, unit: string): string {
  if (!UNITS.includes(unit)) return 'Elige una unidad válida.';
  const value = quantity.trim().replace(',', '.');
  if (!value) return 'Falta cantidad.';
  if (measured.has(unit)) {
    return /^\d+(?:\.\d{1,3})?$/.test(value) && Number(value) > 0 && Number(value) <= 9999.999
      ? ''
      : 'Usa un valor positivo hasta 9999,999, con máximo tres decimales.';
  }
  return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 9999
    ? ''
    : 'Usa un número entero entre 1 y 9999.';
}

/** Integer thousandths retain exact measured values when stepping by one unit. */
export function steppedQuantity(quantity: string, unit: string, delta: number): string {
  if (quantityIssue(quantity, unit)) return quantity;
  const [whole, fraction = ''] = quantity.trim().replace(',', '.').split('.');
  const result = Number(whole) * 1000 + Number(fraction.padEnd(3, '0')) + delta * 1000;
  if (result <= 0 || result > (measured.has(unit) ? 9999999 : 9999000)) return quantity;
  return `${Math.floor(result / 1000)}${
    result % 1000
      ? '.' +
        String(result % 1000)
          .padStart(3, '0')
          .replace(/0+$/, '')
      : ''
  }`;
}
