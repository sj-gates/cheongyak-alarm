/**
 * 찜한 공고 분석 (웹 빌드 전용). 가진 자료로 문장까지 만들어 data/analysis/<공고>.json 으로 올린다.
 * 웹·앱의 분석 탭은 그 파일을 그대로 보여 주므로, 분석 내용을 바꿔도 앱을 다시 빌드할 필요가 없다.
 *
 *   입지   카카오 로컬 (지하철역 · 학교 · 학원 · 병원 · 대형마트)
 *   가격   분양가 대 주변 실거래 (전용 평당)
 *   경쟁   이 공고와 주변 최근 분양의 1순위 경쟁률
 *   자금   잔금대출 예상과 대출 외 필요한 돈
 *   조건   규제지역 · 분양가상한제 · 입주 시기 · 규모
 *
 * 문장은 한 줄에 한 가지만 담고 "\n" 으로 나눈다 (휴대폰 폭에서 한 줄 20자 안팎).
 */
import { formatManwonShort, formatUnits, formatYearMonth } from '../src/lib/format';
import { estimateLoan, loanArea } from '../src/lib/loan';
import { NEARBY_CATEGORIES, rateText } from '../src/lib/nearby';
import type {
  AnalysisPoint,
  AnalysisSection,
  HouseModel,
  NearbyRate,
  NearbyTrades,
  Notice,
  NoticeAnalysis,
} from '../src/lib/types';
import type { LocationInfo } from './kakao';

const PYEONG = 3.3058;
const walk = (m: number) => `도보 ${Math.max(1, Math.round(m / 67))}분`;
const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m / 10) * 10}m`);
const money = (manwon: number) => formatManwonShort(Math.round(manwon / 100) * 100);

function locationSection(loc: LocationInfo, hl: string[]): AnalysisSection {
  const points: AnalysisPoint[] = [];

  const near = loc.stations[0];
  if (near) {
    if (near.distance <= 500) hl.push('역세권');
    points.push({
      icon: 'train',
      title: '지하철',
      text: loc.stations.map((s) => `${s.name}${s.lines.length ? ` (${s.lines.join('·')})` : ''} · ${walk(s.distance)}`).join('\n'),
      tone: near.distance <= 800 ? 'good' : undefined,
    });
  } else {
    points.push({ icon: 'train', title: '지하철', text: '반경 3km 안에 지하철역이 없어요', tone: 'bad' });
  }

  if (loc.schools.length) {
    const elementary = loc.schools.find((s) => s.kind === '초등학교');
    if (elementary && elementary.distance <= 500) hl.push('초등학교 가까움');
    points.push({
      icon: 'school',
      title: '학교',
      text: loc.schools.map((s) => `${s.name} · ${walk(s.distance)}`).join('\n'),
      tone: elementary && elementary.distance <= 500 ? 'good' : undefined,
    });
  }

  if (loc.academies !== undefined) {
    const n = loc.academies;
    if (n >= 150) hl.push('학원가');
    points.push({
      icon: 'book',
      title: '학원',
      text: `반경 1km 학원 ${n.toLocaleString('ko-KR')}곳${n >= 150 ? '\n학원가가 가까워요' : n < 30 ? '\n학원은 적은 편이에요' : ''}`,
      tone: n >= 150 ? 'good' : undefined,
    });
  }

  const living = [
    loc.mart ? `${loc.mart.name} · ${dist(loc.mart.distance)}` : '3km 안에 대형마트 없음',
    loc.hospitals !== undefined ? `반경 1km 병원 ${loc.hospitals.toLocaleString('ko-KR')}곳` : '',
  ].filter(Boolean);
  points.push({ icon: 'cart', title: '생활 (대형마트 · 병원)', text: living.join('\n') });

  return {
    title: '입지',
    points,
    note: `직선거리 기준이고 도보는 분당 67m로 어림했어요.${loc.approximate ? ' 정확한 번지가 없어 동네 중심에서 쟀어요.' : ''} 자료: 카카오 로컬`,
  };
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function priceSection(model: HouseModel & { price: number; exclusiveArea: number }, trades: NearbyTrades, hl: string[]): AnalysisSection | null {
  if (!trades.items.length) return null;
  const mine = (model.price / model.exclusiveArea) * PYEONG;
  // 비교 단지(최대 5곳) 전용 평당가의 중간값: 한두 곳이 튀어도 덜 흔들리게
  const avg = median(trades.items.map((t) => (t.price / t.area) * PYEONG));
  const count = trades.items.length;
  const diff = (mine - avg) / avg;
  const pct = Math.round(Math.abs(diff) * 100);
  const gap = Math.abs(((avg - mine) / PYEONG) * model.exclusiveArea);
  if (diff <= -0.05) hl.push(`주변보다 ${pct}% 저렴`);
  else if (diff >= 0.05) hl.push(`주변보다 ${pct}% 비쌈`);

  return {
    title: '가격',
    points: [
      {
        icon: 'price',
        title: '분양가 대 시세',
        text: [
          `분양가(${model.label}) 전용 평당 ${money(mine)}`,
          `주변 ${count}곳 ${count > 2 ? '중간값' : '평균'} ${money(avg)}`,
          pct < 3 ? '→ 주변 시세와 비슷해요' : `→ 주변보다 ${pct}% ${diff < 0 ? '낮아요' : '높아요'}`,
          pct < 3 ? '' : `같은 넓이로 약 ${money(gap)} ${diff < 0 ? '싸요' : '비싸요'}`,
        ]
          .filter(Boolean)
          .join('\n'),
        tone: diff <= -0.05 ? 'good' : diff >= 0.05 ? 'bad' : undefined,
      },
      {
        icon: 'home',
        title: '비교 단지',
        text: trades.items
          .slice(0, 3)
          .map((t) => `${t.name}${t.buildYear ? `(${t.buildYear})` : ''} · ${formatManwonShort(t.price)}`)
          .join('\n'),
      },
    ],
    note: '넓이가 비슷한 주변 단지의 최근 매매로 어림한 참고값이에요. 새 아파트는 보통 주변 구축보다 비싸요. 자료: 국토교통부 실거래가',
  };
}

function competitionSection(own: NearbyRate | null, rates: NearbyRate[] | undefined, hl: string[]): AnalysisSection | null {
  const points: AnalysisPoint[] = [];
  if (own) {
    points.push({
      icon: 'people',
      title: '이 공고',
      text: `1순위 평균 ${rateText(own).text}${own.top ? `\n최고 ${own.top.type} ${own.top.rate.toFixed(1)} : 1` : ''}`,
    });
  }
  if (rates?.length) {
    const max = Math.max(...rates.map((r) => r.requests / r.units));
    const anyShort = rates.some((r) => r.requests < r.units);
    const judge =
      max >= 30
        ? '경쟁이 치열한 지역이에요'
        : max >= 10
          ? '경쟁이 높은 편이에요'
          : anyShort
            ? '미달도 나온 지역이라 당첨 가능성은 높은 편이에요'
            : '경쟁은 보통이에요';
    if (max >= 30) hl.push('경쟁 치열');
    else if (anyShort && max < 10) hl.push('주변 미달 있음');
    points.push({
      icon: 'people',
      title: '주변 최근 분양',
      text: `${rates.map((r) => `${r.name} · ${rateText(r).text}`).join('\n')}\n→ ${judge}`,
    });
  }
  return points.length ? { title: '경쟁', points, note: '1순위 평균 경쟁률 (접수 건수 ÷ 일반공급 세대수)' } : null;
}

function moneySection(n: Notice, model: HouseModel & { price: number }): AnalysisSection {
  const where = loanArea(n);
  const line = (firstTime: boolean): AnalysisPoint => {
    const e = estimateLoan(model.price, where, firstTime);
    return {
      icon: 'wallet',
      title: firstTime ? '생애최초' : '무주택',
      text: `잔금대출 약 ${money(e.amount)} (LTV ${e.ltv}%${e.capped ? ', 한도' : ''})\n대출 외 약 ${money(model.price - e.amount)} 필요`,
    };
  };
  return {
    title: `자금 (${model.label} ${formatManwonShort(model.price)} 기준)`,
    points: [
      line(false),
      line(true),
      { icon: 'calendar', title: '계약금', text: `당첨 직후 보통 분양가의 10~20%\n약 ${money(model.price * 0.1)} ~ ${money(model.price * 0.2)}` },
    ],
    note: '중도금은 대부분 집단대출로 내고 입주 때 잔금대출로 바꿔요. 소득(DSR)에 따라 대출이 줄 수 있어요.',
  };
}

function conditionSection(n: Notice, today: string, hl: string[]): AnalysisSection | null {
  const points: AnalysisPoint[] = [];
  if (NEARBY_CATEGORIES.has(n.category)) {
    const where = loanArea(n);
    points.push(
      where.regulated
        ? { icon: 'flag', title: '규제지역', text: '투기과열지구 · 조정대상지역\n대출 LTV 40% · 전매·재당첨 제한', tone: 'bad' }
        : {
            icon: 'flag',
            title: '비규제지역',
            text: where.capital ? '수도권 비규제지역\nLTV 70% · 주담대 최대 6억' : '지방 비규제지역\nLTV 70% · 대출 총액 한도 없음',
            tone: 'good',
          }
    );
  }
  if (n.tags.includes('분양가상한제')) {
    points.push({ icon: 'price', title: '분양가상한제', text: '주변 시세보다 싸게 나오는 대신\n실거주 의무·전매제한이 붙을 수 있어요\n(모집공고에서 확인)' });
  }
  const moveIn = n.moveIn?.replace(/[^0-9]/g, '');
  if (moveIn && moveIn.length >= 6) {
    const months = (Number(moveIn.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(moveIn.slice(4, 6)) - Number(today.slice(5, 7));
    const when = months <= 0 ? '입주 시작' : months < 12 ? `약 ${months}개월 뒤` : `약 ${Math.round(months / 12)}년 뒤`;
    points.push({ icon: 'calendar', title: '입주 예정', text: `${formatYearMonth(n.moveIn)} (${when})` });
  }
  if (n.totalUnits) {
    if (n.totalUnits >= 1000) hl.push('대단지');
    points.push({ icon: 'home', title: '규모', text: `총 ${formatUnits(n.totalUnits)}${n.totalUnits >= 1000 ? ' · 대단지' : ''}` });
  }
  return points.length ? { title: '조건', points } : null;
}

export function buildAnalysis(input: {
  notice: Notice;
  today: string;
  model?: HouseModel;
  location?: LocationInfo;
  trades?: NearbyTrades;
  rates?: NearbyRate[];
  own?: NearbyRate | null;
}): NoticeAnalysis {
  const { notice: n, today, model, location, trades, rates, own } = input;
  const hl: string[] = [];
  const priced = model?.price && model.exclusiveArea ? (model as HouseModel & { price: number; exclusiveArea: number }) : undefined;
  const sections = [
    location ? locationSection(location, hl) : null,
    priced && trades ? priceSection(priced, trades, hl) : null,
    competitionSection(own ?? null, rates, hl),
    priced && NEARBY_CATEGORIES.has(n.category) ? moneySection(n, priced) : null,
    conditionSection(n, today, hl),
  ].filter((s): s is AnalysisSection => !!s);
  return { at: Date.now(), key: n.key, name: n.name, highlights: hl.slice(0, 5), sections };
}
