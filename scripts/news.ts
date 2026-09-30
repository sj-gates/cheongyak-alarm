/**
 * 공고 동네의 개발 소식 기사 (네이버 뉴스 검색 API, 무료: 하루 2만 5천 번).
 * NAVER_CLIENT_ID · NAVER_CLIENT_SECRET (네이버 개발자센터 → 애플리케이션 등록 → 검색) 이 있을 때만 쓴다.
 */
import { addressArea } from '../src/lib/address';

export interface NewsItem {
  title: string;
  url: string;
  date: string; // YYYY-MM-DD
}

const KEYWORDS = ['재개발', '개통', '착공'];
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const clean = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e]).trim();

/** 동 이름 + 개발 키워드로 찾은 최근 기사 중, 제목에 그 동이나 구가 들어간 것 최대 3개 */
export async function areaNews(address: string, id: string, secret: string): Promise<NewsItem[]> {
  const where = addressArea(address);
  if (!where?.dong) return [];
  const dong = where.dong.replace(/(\D)\d+동$/, '$1동');
  const gu = where.area.split(' ').slice(1).join(' ');
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const k of KEYWORDS) {
    const res = await fetch(`https://openapi.naver.com/v1/search/news.json?display=10&sort=date&query=${encodeURIComponent(`${dong} ${k}`)}`, {
      headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(`네이버 검색 API ${res.status} (키 확인)`);
    if (!res.ok) continue;
    const items = ((await res.json()) as { items?: { title: string; originallink?: string; link: string; pubDate: string }[] }).items ?? [];
    for (const it of items) {
      const title = clean(it.title);
      if (!title.includes(dong.replace(/동$/, '')) && !(gu && title.includes(gu.split(' ').pop()!.replace(/[시군구]$/, '')))) continue;
      if (seen.has(title)) continue;
      seen.add(title);
      const d = new Date(it.pubDate);
      out.push({ title, url: it.originallink || it.link, date: Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10) });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
}
