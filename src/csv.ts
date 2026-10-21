/** Parses CSV text (quoted fields, doubled quotes, line breaks inside quotes) into one object per row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      cells.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      cells.push(field);
      rows.push(cells);
      cells = [];
      field = '';
    } else field += char;
  }
  if (field || cells.length) {
    cells.push(field);
    rows.push(cells);
  }
  const [header = [], ...body] = rows;
  return body
    .filter(row => row.some(cell => cell !== ''))
    .map(row => Object.fromEntries(header.map((name, column) => [name, row[column] ?? ''])));
}
