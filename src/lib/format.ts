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

/** 제목 아래 세대수 한 줄: "이번 공고 62세대 · 일반 40 · 특별 22" */
export function unitsLine(totalUnits: number | undefined, models: { generalUnits?: number; specialUnits?: number }[] = []): string {
  const sum = (pick: (m: (typeof models)[number]) => number | undefined) => {
    const v = models.map(pick).filter((x): x is number => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) : undefined;
  };
  const general = sum((m) => m.generalUnits);
  const special = sum((m) => m.specialUnits);
  const total = totalUnits ?? (general !== undefined || special !== undefined ? (general ?? 0) + (special ?? 0) : undefined);
  if (!total) return '';
  const parts = [`이번 공고 ${formatUnits(total)}`];
  // 일반+특별이 공급규모와 맞을 때만 나눠 보여 준다 (우선공급 등이 섞이면 헷갈리니까)
  if ((general ?? 0) + (special ?? 0) !== total) return parts[0];
  if (general) parts.push(`일반 ${general.toLocaleString('ko-KR')}`);
  if (special) parts.push(`특별 ${special.toLocaleString('ko-KR')}`);
  return parts.join(' · ');
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
