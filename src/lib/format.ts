export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** 만원 단위 금액 → "8억 5,400만원" */
export function formatManwon(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const eok = Math.floor(value / 10000);
  const man = Math.round(value % 10000);
  if (eok === 0) return `${man.toLocaleString('ko-KR')}만원`;
  if (man === 0) return `${eok}억원`;
  return `${eok}억 ${man.toLocaleString('ko-KR')}만원`;
}

export function formatArea(value?: number): string {
  if (value === undefined) return '-';
  return `${value.toFixed(2).replace(/\.?0+$/, '')}㎡`;
}

export function formatUnits(value?: number): string {
  if (value === undefined) return '-';
  return `${value.toLocaleString('ko-KR')}세대`;
}

/** "0215881234" → "02-1588-1234", "15881234" → "1588-1234" */
export function formatPhone(value: string): string {
  const d = value.replace(/[^0-9]/g, '');
  if (/^(15|16|18)\d{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.startsWith('02') && (d.length === 9 || d.length === 10)) {
    return `02-${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  }
  if (d.length === 10 || d.length === 11) {
    return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`;
  }
  return value;
}

/** "202711" → "2027년 11월" */
export function formatYearMonth(value?: string): string {
  if (!value) return '-';
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 6) return value;
  return `${digits.slice(0, 4)}년 ${Number(digits.slice(4, 6))}월`;
}

/** 표처럼 좁은 칸용: "12억 4,000만" */
export function formatManwonShort(value?: number | null): string {
  return formatManwon(value).replace(/원$/, '');
}
