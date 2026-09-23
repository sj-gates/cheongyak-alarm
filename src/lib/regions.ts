/** 공급지역 필터에 쓰는 17개 시·도. 주소 앞부분으로도 판별한다. */
export const REGIONS: { name: string; prefixes: string[] }[] = [
  { name: '서울', prefixes: ['서울'] },
  { name: '경기', prefixes: ['경기'] },
  { name: '인천', prefixes: ['인천'] },
  { name: '부산', prefixes: ['부산'] },
  { name: '대구', prefixes: ['대구'] },
  { name: '광주', prefixes: ['광주'] },
  { name: '대전', prefixes: ['대전'] },
  { name: '울산', prefixes: ['울산'] },
  { name: '세종', prefixes: ['세종'] },
  { name: '강원', prefixes: ['강원'] },
  { name: '충북', prefixes: ['충북', '충청북도'] },
  { name: '충남', prefixes: ['충남', '충청남도'] },
  { name: '전북', prefixes: ['전북', '전라북도'] },
  { name: '전남', prefixes: ['전남', '전라남도'] },
  { name: '경북', prefixes: ['경북', '경상북도'] },
  { name: '경남', prefixes: ['경남', '경상남도'] },
  { name: '제주', prefixes: ['제주'] },
];

export const REGION_NAMES = REGIONS.map((r) => r.name);

/** 공급지역명(예: "서울", "경기") 을 먼저 보고, 없으면 주소 앞부분으로 시·도를 찾는다 */
export function regionOf(areaName: string, address: string): string {
  const area = areaName.trim();
  for (const r of REGIONS) {
    if (r.prefixes.some((p) => area.startsWith(p))) return r.name;
  }
  const addr = address.trim();
  for (const r of REGIONS) {
    if (r.prefixes.some((p) => addr.startsWith(p))) return r.name;
  }
  return area || '기타';
}
