const REQUIRED = ['Date', 'Start', 'End', 'Room', 'Teacher'];

export function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x !== '')) rows.push(row);
      row = [];
      if (rows.length > 5001) throw new Error('Limit: 5,000 roster rows.');
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed quoted field.');
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) throw new Error('The CSV is empty.');
  const headers = rows.shift().map(x => x.trim());
  if (headers.some(x => !x) || new Set(headers).size !== headers.length) throw new Error('Headers must be nonblank and unique.');
  for (const field of REQUIRED) if (!headers.includes(field)) throw new Error(`Missing required column: ${field}.`);
  return rows.map((cells, i) => {
    if (cells.length !== headers.length) throw new Error(`Row ${i + 2} has ${cells.length} cells; expected ${headers.length}.`);
    return { line: i + 2, ...Object.fromEntries(headers.map((h, j) => [h, cells[j].trim()])) };
  });
}

function minutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
}

export function auditRoster(rows) {
  const issues = [], accepted = [], seen = new Map();
  for (const row of rows) {
    const missing = REQUIRED.filter(k => !row[k]);
    if (missing.length) { issues.push({ severity: 'Fix', line: row.line, type: 'Missing field', detail: missing.join(', ') }); continue; }
    const start = minutes(row.Start), end = minutes(row.End);
    if (!validDate(row.Date) || start === null || end === null || end <= start) {
      issues.push({ severity: 'Fix', line: row.line, type: 'Invalid date/time', detail: 'Use YYYY-MM-DD and HH:MM; End must be after Start on the same day.' });
      continue;
    }
    const signature = [row.Date, row.Start, row.End, row.Room, row.Teacher].join('\u0000');
    if (seen.has(signature)) {
      issues.push({ severity: 'Review', line: row.line, type: 'Duplicate assignment', detail: `Same as row ${seen.get(signature)}; this row is excluded from hour totals.` });
      continue;
    }
    seen.set(signature, row.line);
    accepted.push({ ...row, start, end });
  }

  const groups = new Map();
  for (const row of accepted) {
    const key = `${row.Date}\u0000${row.Teacher}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.start - b.start || a.end - b.end);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length && entries[j].start < entries[i].end; j++) {
        const a = entries[i], b = entries[j];
        issues.push({ severity: 'Fix', line: b.line, type: 'Teacher overlap', detail: `${b.Teacher} has overlapping assignments on ${b.Date}: rows ${a.line} (${a.Room}) and ${b.line} (${b.Room}).` });
      }
    }
  }

  const totals = new Map();
  for (const row of accepted) totals.set(row.Teacher, (totals.get(row.Teacher) ?? 0) + row.end - row.start);
  const workload = [...totals].map(([teacher, total]) => ({ teacher, minutes: total })).sort((a, b) => b.minutes - a.minutes || a.teacher.localeCompare(b.teacher));
  return { issues: issues.sort((a, b) => a.line - b.line), workload, accepted: accepted.length, rows: rows.length };
}

function safe(value) {
  const str = String(value ?? '');
  const protectedValue = /^\s*[=+@-]/.test(str) ? `'${str}` : str;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function issuesCsv(result) {
  const rows = [['Severity', 'CSV row', 'Issue', 'Detail'], ...result.issues.map(x => [x.severity, x.line, x.type, x.detail])];
  return rows.map(row => row.map(safe).join(',')).join('\r\n') + '\r\n';
}
