// Inspect the actual stroked checklist boxes. Text extraction cannot detect a
// reused pdfmake canvas object drifting off the page or overlapping other boxes.
export async function inspectCheckboxes(page) {
  const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const operators = await page.getOperatorList();
  const viewport = page.getViewport({ scale: 1 });
  let transform = [1, 0, 0, 1, 0, 0];
  const stack = [], boxes = [], offPaper = [];
  const multiply = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  for (let index = 0; index < operators.fnArray.length; index++) {
    const operation = operators.fnArray[index], args = operators.argsArray[index];
    if (operation === OPS.save) stack.push([...transform]);
    else if (operation === OPS.restore) transform = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (operation === OPS.transform) transform = multiply(transform, args);
    else if (operation === OPS.constructPath && args?.[0] === OPS.stroke && args[2]) {
      const bounds = args[2];
      // The printed checklist uses an 8pt outlined square in every layout.
      if (Math.abs(bounds[2] - bounds[0] - 8) > 0.1 || Math.abs(bounds[3] - bounds[1] - 8) > 0.1) continue;
      const points = [[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[3]]]
        .map(([x, y]) => [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]]);
      const rectangle = [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
      if (rectangle[0] < 0 || rectangle[1] < 0 || rectangle[2] > viewport.width || rectangle[3] > viewport.height) offPaper.push(rectangle);
      else boxes.push(rectangle);
    }
  }
  const unique = new Set(boxes.map(box => box.map(number => number.toFixed(2)).join(',')));
  return { drawn: boxes.length + offPaper.length, printable: unique.size, duplicatePositions: boxes.length - unique.size, offPaper };
}
