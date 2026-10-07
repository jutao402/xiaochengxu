export const FORMAT = 'personal-daily';
export const VERSION = 1;
export function beijingDate(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => p.find(x => x.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const d = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function shiftDate(date, amount) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0,10);
}
function timestamp(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)); }
export function validateBackup(raw) {
  if (!raw || raw.format !== FORMAT || raw.version !== VERSION || !timestamp(raw.exportedAt)) throw new Error('不是支持的日常备份，或备份版本不兼容。');
  if (!Array.isArray(raw.tasks) || !Array.isArray(raw.notes) || raw.tasks.length > 100000 || raw.notes.length > 50000) throw new Error('备份记录格式或数量不正确。');
  const ids = new Set(), dates = new Set();
  const tasks = raw.tasks.map(t => {
    if (!t || typeof t.id !== 'string' || !t.id.length || t.id.length > 100 || ids.has(t.id) || !validDate(t.date) || typeof t.title !== 'string' || !t.title.trim() || t.title.length > 500 || typeof t.done !== 'boolean' || !timestamp(t.createdAt) || !timestamp(t.updatedAt)) throw new Error('任务内容不合法或存在重复编号。');
    ids.add(t.id); return {id:t.id,date:t.date,title:t.title,done:t.done,createdAt:t.createdAt,updatedAt:t.updatedAt};
  });
  const notes = raw.notes.map(n => {
    if (!n || !validDate(n.date) || dates.has(n.date) || typeof n.body !== 'string' || n.body.length > 200000 || !timestamp(n.createdAt) || !timestamp(n.updatedAt)) throw new Error('随记内容不合法或同一天存在多篇随记。');
    dates.add(n.date); return {date:n.date,body:n.body,createdAt:n.createdAt,updatedAt:n.updatedAt};
  });
  return {format:FORMAT,version:VERSION,exportedAt:raw.exportedAt,tasks,notes};
}
export function createBackup(tasks, notes) { return {format:FORMAT,version:VERSION,exportedAt:new Date().toISOString(),tasks,notes}; }
export function mergeRecords(current, incoming) {
  const merge = (a,b,key) => { const map = new Map(a.map(x => [x[key],x])); for (const x of b) { const old = map.get(x[key]); if (!old || Date.parse(x.updatedAt) > Date.parse(old.updatedAt)) map.set(x[key],x); } return [...map.values()]; };
  return {tasks:merge(current.tasks,incoming.tasks,'id'),notes:merge(current.notes,incoming.notes,'date')};
}
export function notesMarkdown(notes) {
  return '# 每日随记\n\n' + [...notes].sort((a,b)=>a.date.localeCompare(b.date)).map(n=>`## ${n.date}\n\n${n.body}\n`).join('\n');
}
