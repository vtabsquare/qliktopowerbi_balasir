/**
 * qvd-parser.ts
 *
 * Pure TypeScript QVD binary parser — no external dependencies.
 * Faithfully implements the same algorithm as Python's pyqvd library:
 *   1. XML header: column names, record count, symbol/data offsets, per-field metadata
 *   2. Symbol table: unique values per field (int, double, string, dual variants)
 *   3. Bit-packed index table: which symbol each row uses for each field
 *
 * Bit-position formula (matches pyqvd exactly):
 *   globalBit = (rowIndex * recordByteSize * 8) + field.bitOffset + bitSlot
 *   byteInBuffer = dataOffset + Math.floor(globalBit / 8)
 *   bitInByte    = globalBit % 8
 */

export interface QvdField {
  name: string;
  bitOffset: number;
  bitWidth: number;
  bias: number;
  noOfSymbols: number;
  /** Byte offset of this field's symbol block within the symbol section */
  symbolOffset: number;
  /** Byte length of this field's symbol block */
  symbolLength: number;
  symbols: (string | number | null)[];
}

export interface QvdParseResult {
  columns: string[];
  rows: (string | number | null)[][];
  rowCount: number;
  csv: string;
}

// ─── XML header extraction ─────────────────────────────────────────────────────

function extractXmlHeader(buffer: Uint8Array): { xml: string; headerEndByte: number } {
  const tag = "</QvdTableHeader>";
  // Detect UTF-16LE BOM (FF FE)
  const hasBom = buffer[0] === 0xff && buffer[1] === 0xfe;

  if (hasBom) {
    // Encode tag as UTF-16LE bytes for scanning
    const tagBytes: number[] = [];
    for (let i = 0; i < tag.length; i++) tagBytes.push(tag.charCodeAt(i), 0);
    let headerEndByte = -1;
    outer: for (let i = 2; i <= buffer.length - tagBytes.length; i += 2) {
      for (let j = 0; j < tagBytes.length; j++) {
        if (buffer[i + j] !== tagBytes[j]) continue outer;
      }
      // After the closing tag there is a newline (\n = 0x0A, 0x00 in UTF-16LE)
      headerEndByte = i + tagBytes.length;
      // Consume the trailing newline if present
      if (buffer[headerEndByte] === 0x0a && buffer[headerEndByte + 1] === 0x00) headerEndByte += 2;
      break;
    }
    if (headerEndByte === -1) throw new Error("QVD XML header not found (UTF-16LE scan).");
    const slice = buffer.slice(2, headerEndByte);
    const chars: string[] = [];
    for (let i = 0; i < slice.length - 1; i += 2) {
      chars.push(String.fromCharCode(slice[i] | (slice[i + 1] << 8)));
    }
    return { xml: chars.join(""), headerEndByte };
  } else {
    // UTF-8 / ASCII
    const tagBytes = new TextEncoder().encode(tag);
    let headerEndByte = -1;
    outer: for (let i = 0; i <= buffer.length - tagBytes.length; i++) {
      for (let j = 0; j < tagBytes.length; j++) {
        if (buffer[i + j] !== tagBytes[j]) continue outer;
      }
      headerEndByte = i + tagBytes.length;
      if (buffer[headerEndByte] === 0x0a) headerEndByte += 1; // consume trailing \n
      break;
    }
    if (headerEndByte === -1) throw new Error("QVD XML header not found (UTF-8 scan).");
    return { xml: new TextDecoder("utf-8").decode(buffer.slice(0, headerEndByte)), headerEndByte };
  }
}

// ─── XML helpers (no DOM dependency) ──────────────────────────────────────────

function getTagValue(xml: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return "";
  const end = xml.indexOf(close, start);
  if (end === -1) return "";
  return xml.slice(start + open.length, end).trim();
}

function splitTags(xml: string, tag: string): string[] {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const result: string[] = [];
  let pos = 0;
  while (true) {
    const start = xml.indexOf(open, pos);
    if (start === -1) break;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    result.push(xml.slice(start, end + close.length));
    pos = end + close.length;
  }
  return result;
}

// ─── Header parsing ────────────────────────────────────────────────────────────

interface QvdHeader {
  noOfRecords: number;
  recordByteSize: number;
  fields: QvdField[];
  /** Absolute byte offset in the buffer where the symbol section begins */
  symbolSectionStart: number;
  /** Absolute byte offset in the buffer where the index/data section begins */
  dataOffset: number;
}

function parseHeader(xml: string, headerEndByte: number): QvdHeader {
  const noOfRecords   = parseInt(getTagValue(xml, "NoOfRecords")   || "0", 10);
  const recordByteSize = parseInt(getTagValue(xml, "RecordByteSize") || "0", 10);

  // The top-level <Offset> and <Length> describe the symbol section relative to
  // the end of the XML header (same as pyqvd).
  const sectionOffset = parseInt(getTagValue(xml, "Offset") || "0", 10);
  const sectionLength = parseInt(getTagValue(xml, "Length") || "0", 10);

  const symbolSectionStart = headerEndByte + sectionOffset;
  const dataOffset         = symbolSectionStart + sectionLength;

  const fieldTags = splitTags(xml, "QvdFieldHeader");
  const fields: QvdField[] = fieldTags.map((fieldXml) => ({
    name:         getTagValue(fieldXml, "FieldName"),
    bitOffset:    parseInt(getTagValue(fieldXml, "BitOffset")    || "0", 10),
    bitWidth:     parseInt(getTagValue(fieldXml, "BitWidth")     || "0", 10),
    bias:         parseInt(getTagValue(fieldXml, "Bias")         || "0", 10),
    noOfSymbols:  parseInt(getTagValue(fieldXml, "NoOfSymbols")  || "0", 10),
    // Per-field symbol offset/length within the symbol section
    symbolOffset: parseInt(getTagValue(fieldXml, "Offset")       || "0", 10),
    symbolLength: parseInt(getTagValue(fieldXml, "Length")       || "0", 10),
    symbols: [],
  }));

  return { noOfRecords, recordByteSize, fields, symbolSectionStart, dataOffset };
}

// ─── Symbol table decoding ─────────────────────────────────────────────────────
// Type byte meanings (identical to pyqvd):
//   0x01  INT      – 4-byte little-endian signed integer
//   0x02  DOUBLE   – 8-byte little-endian IEEE 754 double
//   0x04  STRING   – null-terminated UTF-8 string
//   0x05  DUAL_INT – 4-byte int THEN null-terminated string (display value used)
//   0x06  DUAL_DBL – 8-byte double THEN null-terminated string (display value used)

const SYM_INT        = 0x01;
const SYM_DOUBLE     = 0x02;
const SYM_STRING     = 0x04;
const SYM_DUAL_INT   = 0x05;
const SYM_DUAL_DOUBLE = 0x06;

function readNullTermString(buf: Uint8Array, pos: number): { value: string; nextPos: number } {
  let end = pos;
  while (end < buf.length && buf[end] !== 0) end++;
  return { value: new TextDecoder("utf-8").decode(buf.slice(pos, end)), nextPos: end + 1 };
}

function decodeSymbols(buf: Uint8Array, header: QvdHeader): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  for (const field of header.fields) {
    field.symbols = [];

    // Use per-field offset/length when available (pyqvd uses these for precision).
    // Fall back to sequential reading if the fields don't have individual offsets.
    const hasPerFieldOffsets = field.symbolOffset !== 0 || field.symbolLength !== 0;
    let pos = hasPerFieldOffsets
      ? header.symbolSectionStart + field.symbolOffset
      : /* will be set by sequential logic */ -1;

    if (pos === -1) {
      // Sequential fallback: compute position from previous field's end.
      // This branch only triggers for very old QVD versions without per-field offsets.
      // In practice, modern QVDs always have per-field offsets.
      pos = header.symbolSectionStart;
    }

    for (let s = 0; s < field.noOfSymbols; s++) {
      if (pos >= buf.length) break;
      const type = buf[pos++];

      if (type === SYM_INT) {
        field.symbols.push(view.getInt32(pos, /* littleEndian */ true));
        pos += 4;
      } else if (type === SYM_DOUBLE) {
        field.symbols.push(view.getFloat64(pos, /* littleEndian */ true));
        pos += 8;
      } else if (type === SYM_STRING) {
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else if (type === SYM_DUAL_INT) {
        // Skip the 4-byte integer; use the string display value (matches pyqvd)
        pos += 4;
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else if (type === SYM_DUAL_DOUBLE) {
        // Skip the 8-byte double; use the string display value (matches pyqvd)
        pos += 8;
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else {
        // Unknown type byte — treat as null and stop reading this field's symbols
        // to avoid cascading misalignment.
        field.symbols.push(null);
        break;
      }
    }
  }
}

// ─── Row bit-stream decoding ───────────────────────────────────────────────────
//
// pyqvd formula (critical — our old code had this wrong):
//
//   For row r, field f:
//     globalBitStart = r * recordByteSize * 8 + f.bitOffset
//     for each bit b in [0, f.bitWidth):
//       bitPos     = globalBitStart + b
//       byteIndex  = dataOffset + (bitPos >> 3)      ← note: relative to dataOffset
//       bitInByte  = bitPos & 7
//       if buf[byteIndex] & (1 << bitInByte): symbolIndex |= (1 << b)
//
//   symbolIndex += field.bias
//   value = field.symbols[symbolIndex]   (null if out of range)
//
// The old code used `rowBase * 8` where rowBase already included dataOffset,
// which gave a bit position that was ~dataOffset*8 bits too large.

function decodeRows(buf: Uint8Array, header: QvdHeader): (string | number | null)[][] {
  const { dataOffset, recordByteSize, noOfRecords, fields } = header;
  const rows: (string | number | null)[][] = [];

  for (let r = 0; r < noOfRecords; r++) {
    const row: (string | number | null)[] = [];
    const rowBitBase = r * recordByteSize * 8; // bit offset from start of data section

    for (const field of fields) {
      if (field.bitWidth === 0) {
        // All rows share the single symbol (constant field)
        row.push(field.noOfSymbols > 0 ? (field.symbols[0] ?? null) : null);
        continue;
      }

      let symbolIndex = 0;
      const fieldBitStart = rowBitBase + field.bitOffset;

      for (let b = 0; b < field.bitWidth; b++) {
        const bitPos    = fieldBitStart + b;
        const byteIndex = dataOffset + (bitPos >> 3);  // ← correct: relative to dataOffset
        const bitInByte = bitPos & 7;
        if (byteIndex < buf.length && (buf[byteIndex] & (1 << bitInByte))) {
          symbolIndex |= (1 << b);
        }
      }

      const symIdx = symbolIndex + field.bias;
      row.push(symIdx >= 0 && symIdx < field.symbols.length ? (field.symbols[symIdx] ?? null) : null);
    }

    rows.push(row);
  }

  return rows;
}

// ─── Symbol table sequential decode (fallback for QVDs without per-field offsets) ─

/**
 * Decode the symbol section sequentially when individual field offsets are absent
 * or all zero. This is the legacy path for older QVD files.
 */
function decodeSymbolsSequential(buf: Uint8Array, header: QvdHeader): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = header.symbolSectionStart;

  for (const field of header.fields) {
    field.symbols = [];
    for (let s = 0; s < field.noOfSymbols; s++) {
      if (pos >= buf.length) break;
      const type = buf[pos++];

      if (type === SYM_INT) {
        field.symbols.push(view.getInt32(pos, true));
        pos += 4;
      } else if (type === SYM_DOUBLE) {
        field.symbols.push(view.getFloat64(pos, true));
        pos += 8;
      } else if (type === SYM_STRING) {
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else if (type === SYM_DUAL_INT) {
        pos += 4;
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else if (type === SYM_DUAL_DOUBLE) {
        pos += 8;
        const { value, nextPos } = readNullTermString(buf, pos);
        field.symbols.push(value);
        pos = nextPos;
      } else {
        field.symbols.push(null);
        break;
      }
    }
  }
}

// ─── CSV serialisation ─────────────────────────────────────────────────────────

function escapeCSV(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(columns: string[], rows: (string | number | null)[][]): string {
  const lines: string[] = [columns.map(escapeCSV).join(",")];
  for (const row of rows) lines.push(row.map(escapeCSV).join(","));
  return lines.join("\r\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a QVD file buffer to CSV.
 * Produces identical output to Python's pyqvd library.
 *
 * @param buffer  Raw bytes of the .qvd file (ArrayBuffer or Buffer).
 * @returns       { csv, columns, rows, rowCount }
 */
export function qvdToCSV(buffer: ArrayBuffer): QvdParseResult {
  const buf = new Uint8Array(buffer);
  const { xml, headerEndByte } = extractXmlHeader(buf);
  const header = parseHeader(xml, headerEndByte);

  if (header.fields.length === 0) {
    throw new Error("QVD has no field definitions in the XML header.");
  }

  // Choose the right symbol decode strategy.
  // Modern QVDs store a per-field Offset+Length inside each QvdFieldHeader.
  // Use those when at least one field has a non-zero symbolLength (the reliable indicator).
  const hasPerFieldOffsets = header.fields.some((f) => f.symbolLength > 0);

  if (hasPerFieldOffsets) {
    decodeSymbols(buf, header);
  } else {
    // Legacy sequential decode — reads symbols one after another from the start
    // of the symbol section (matches the old pyqvd behaviour for older QVDs).
    decodeSymbolsSequential(buf, header);
  }

  const rows    = decodeRows(buf, header);
  const columns = header.fields.map((f) => f.name);
  const csv     = buildCSV(columns, rows);

  return { columns, rows, rowCount: rows.length, csv };
}
