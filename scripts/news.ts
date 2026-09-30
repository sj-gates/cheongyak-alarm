/**
 * 공고 동네의 개발 소식 기사.
 *   - NAVER_CLIENT_ID · NAVER_CLIENT_SECRET 이 있으면 네이버 뉴스 검색 API (무료, 하루 2만 5천 번)
 *   - 없으면 구글 뉴스 검색 RSS (키 없음)
 * 동 이름 + 재개발·개통·착공으로 찾고, 제목에 그 동이나 시·군·구 이름이 들어간 최근 기사 3개만.
 */
import { addressArea } from '../src/lib/address';

export interface NewsItem {
  title: string;
  url: string;
  date: string; // YYYY-MM-DD
}
export interface NaverKeys {
  id: string;
  secret: string;
}

const KEYWORDS = ['재개발', '개통', '착공'];
// 호재와 상관없는 동네 소식(행사·사건)은 뺀다: 제목에 개발 관련 말이 있어야
const DEVELOPMENT = /재개발|재건축|정비|개통|착공|준공|철도|노선|역세권|GTX|신설|개발|신도시|도로|교통|분양|입주|학교/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
const clean = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e: string) => ENTITIES[e]).trim();
const day = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

async function naver(query: string, keys: NaverKeys): Promise<NewsItem[]> {
  const res = await fetch(`https://openapi.naver.com/v1/search/news.json?display=10&sort=date&query=${encodeURIComponent(query)}`, {
    headers: { 'X-Naver-Client-Id': keys.id, 'X-Naver-Client-Secret': keys.secret },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error(`네이버 검색 API ${res.status} (키 확인)`);
  if (!res.ok) return [];
  const items = ((await res.json()) as { items?: { title: string; originallink?: string; link: string; pubDate: string }[] }).items ?? [];
  return items.map((it) => ({ title: clean(it.title), url: it.originallink || it.link, date: day(it.pubDate) }));
}

async function google(query: string): Promise<NewsItem[]> {
  await new Promise((r) => setTimeout(r, 400)); // 너무 몰아서 묻지 않게
  const res = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; cheongyak-alarm/1.0; +https://sj-gates.github.io/cheongyak-alarm)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map((m) => {
    const pick = (tag: string) => m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';
    return { title: clean(pick('title')), url: clean(pick('link')), date: day(pick('pubDate')) };
  });
}

export async function areaNews(address: string, keys?: NaverKeys): Promise<NewsItem[]> {
  const where = addressArea(address);
  if (!where?.dong) return [];
  const dong = where.dong.replace(/(\D)\d+동$/, '$1동');
  const dongStem = dong.replace(/(동|읍|면)$/, '');
  const guStem = (where.area.split(' ').pop() ?? '').replace(/[시군구]$/, '');
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const k of KEYWORDS) {
    const items = keys ? await naver(`${dong} ${k}`, keys) : await google(`${dong} ${k}`);
    for (const it of items) {
      if (!it.title || !it.url || !/^https?:\/\//.test(it.url)) continue;
      if (!it.title.includes(dongStem) && !(guStem.length >= 2 && it.title.includes(guStem))) continue;
      if (!DEVELOPMENT.test(it.title)) continue;
      const key = it.title.replace(/\s+-\s+[^-]+$/, ''); // 구글은 제목 끝에 " - 언론사"
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
}
