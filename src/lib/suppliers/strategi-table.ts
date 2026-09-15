/**
 * Read the text of Strategi's server-rendered tables without running portal JS.
 * A product row contains a nested table in its Order cell, so splitting HTML on
 * <tr> or <td> would shift the price and availability columns.
 */
export interface StrategiTable {
  rows: { cells: { kind: "td" | "th"; text: string }[] }[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  reg: "®",
  trade: "™",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (entity, name: string) => {
    if (name.startsWith("#")) {
      const hex = name[1]?.toLowerCase() === "x";
      const point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : entity;
    }
    return ENTITIES[name.toLowerCase()] ?? entity;
  });
}

interface OpenCell {
  kind: "td" | "th";
  rawText: string;
}

interface OpenTable {
  rows: { cells: OpenCell[] }[];
  row: { cells: OpenCell[] } | null;
  cell: OpenCell | null;
}

/** Parse only table structure and visible cell text; attributes are ignored. */
export function parseStrategiTables(html: string): StrategiTable[] {
  const finished: OpenTable[] = [];
  const stack: OpenTable[] = [];
  let index = 0;

  const appendText = (value: string) => {
    for (const table of stack) {
      if (table.cell) table.cell.rawText += value;
    }
  };

  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start < 0) {
      appendText(html.slice(index));
      break;
    }
    appendText(html.slice(index, start));

    if (html.startsWith("<!--", start)) {
      const end = html.indexOf("-->", start + 4);
      index = end < 0 ? html.length : end + 3;
      continue;
    }

    let end = start + 1;
    let quote: string | null = null;
    for (; end < html.length; end += 1) {
      const char = html[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
    }
    if (end >= html.length) break;
    const tag = html.slice(start + 1, end).trim();
    index = end + 1;

    const match = /^(\/)?([a-z][a-z0-9-]*)\b/i.exec(tag);
    if (!match) continue;
    const closing = Boolean(match[1]);
    const name = match[2].toLowerCase();

    if (!closing && (name === "script" || name === "style")) {
      const close = html.toLowerCase().indexOf(`</${name}`, index);
      index = close < 0 ? html.length : close;
      continue;
    }
    if (!closing && name === "br") {
      appendText(" ");
      continue;
    }
    if (name === "table") {
      if (closing) {
        const table = stack.pop();
        if (table) finished.push(table);
      } else {
        stack.push({ rows: [], row: null, cell: null });
      }
      continue;
    }

    const table = stack.at(-1);
    if (!table) continue;
    if (name === "tr") {
      if (closing) {
        table.cell = null;
        table.row = null;
      } else {
        table.row = { cells: [] };
        table.rows.push(table.row);
      }
    } else if (name === "td" || name === "th") {
      if (closing) {
        appendText(" ");
        table.cell = null;
      } else if (table.row) {
        table.cell = { kind: name, rawText: "" };
        table.row.cells.push(table.cell);
      }
    }
  }

  return finished.map((table) => ({
    rows: table.rows.map((row) => ({
      cells: row.cells.map((cell) => ({
        kind: cell.kind,
        text: decodeEntities(cell.rawText).replace(/\s+/g, " ").trim(),
      })),
    })),
  }));
}
