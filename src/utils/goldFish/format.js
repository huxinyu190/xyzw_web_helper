/** 金鱼活动展示用格式化 */

export function formatAmount(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 100000000) return `${(num / 100000000).toFixed(2)} 亿`;
  if (abs >= 10000) return `${(num / 10000).toFixed(abs >= 100000 ? 0 : 1)} 万`;
  return Math.round(num).toLocaleString("zh-CN");
}

export function formatInt(value) {
  return Math.round(Number(value) || 0).toLocaleString("zh-CN");
}

export function formatPercent(value, digits = 0) {
  const num = Math.max(0, Math.min(1, Number(value) || 0));
  if (num >= 0.9999) return "100%";
  return `${(num * 100).toFixed(digits)}%`;
}

export function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
