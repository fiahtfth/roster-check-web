import { parseCsv, auditRoster, issuesCsv } from './engine.mjs';

const $ = id => document.getElementById(id);
const SAMPLE = 'Date,Start,End,Room,Teacher\n2026-10-01,09:00,11:00,Hall A,T-01\n2026-10-01,09:00,11:00,Hall A,T-02\n2026-10-01,10:30,12:00,Hall B,T-01\n2026-10-02,09:00,10:00,Hall C,T-03\n2026-10-02,09:00,10:00,Hall C,T-03\n';
let result;

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function render(data) {
  result = data;
  $('results').classList.remove('hidden');
  const fixes = data.issues.filter(x => x.severity === 'Fix').length;
  const metrics = [['Rows checked', data.rows], ['Fix', fixes], ['Review', data.issues.length - fixes]];
  $('summary').replaceChildren(...metrics.map(([label, value]) => {
    const box = document.createElement('div'); box.className = 'stat';
    const strong = document.createElement('strong'); strong.textContent = value;
    box.append(strong, label); return box;
  }));
  if (!data.issues.length) $('issues').textContent = 'No issues found by these checks.';
  else $('issues').replaceChildren(...data.issues.slice(0, 200).map(item => {
    const box = document.createElement('div'); box.className = `finding ${item.severity === 'Review' ? 'review' : ''}`;
    const strong = document.createElement('strong'); strong.textContent = `${item.severity} · CSV row ${item.line} · ${item.type}`;
    const p = document.createElement('p'); p.textContent = item.detail;
    box.append(strong, p); return box;
  }));
  if (data.issues.length > 200) {
    const note = document.createElement('p'); note.textContent = `Showing first 200 of ${data.issues.length} findings. Download the full CSV.`;
    $('issues').append(note);
  }
  if (!data.workload.length) $('workload').textContent = 'No valid assignments to total.';
  else $('workload').replaceChildren(...data.workload.map(item => {
    const row = document.createElement('div'); row.className = 'work-row';
    const name = document.createElement('span'); name.textContent = item.teacher;
    const hours = document.createElement('strong'); hours.textContent = `${(item.minutes / 60).toFixed(2)} h`;
    row.append(name, hours); return row;
  }));
}

function run(text) {
  try { $('error').textContent = ''; render(auditRoster(parseCsv(text))); }
  catch (error) { $('results').classList.add('hidden'); $('error').textContent = error.message; }
}

$('audit').addEventListener('click', async () => {
  const file = $('file').files?.[0];
  if (!file) { $('error').textContent = 'Choose a CSV file first, or try the fictional sample.'; return; }
  if (file.size > 5 * 1024 * 1024) { $('error').textContent = 'Limit: 5 MB per file.'; return; }
  try { run(await file.text()); }
  catch { $('error').textContent = 'Could not read this file.'; }
});
$('sample').addEventListener('click', () => run(SAMPLE));
$('template').addEventListener('click', () => download('roster-check-template.csv', 'Date,Start,End,Room,Teacher\r\n'));
$('download').addEventListener('click', () => result && download('roster-check-findings.csv', issuesCsv(result)));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
