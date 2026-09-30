// 예정 노선·역 좌표 만들기 (한 번씩 손으로 돌린다): node scripts/make-rail-plans.mjs → scripts/data/rail-plans.json
//
// 서울·경기 근처의 공사 중·개통 예정 노선. 개통 목표는 출처(위키백과·기사)를 보고 적었고, 바뀌면 여기만 고친다.
// 좌표는 OpenStreetMap: 이미 있는 역(환승역)은 OSM 역 데이터, 새 역은 OSM 공사 중·계획 역 또는 역 이름이 된 랜드마크.
// (지도 데이터 © OpenStreetMap contributors, ODbL)
import fs from 'node:fs';

// kind: 'transfer' = 이미 있는 역에 새 노선이 더해짐, 'new' = 새로 생기는 역
// q: 새 역 좌표를 찾을 때 쓸 랜드마크 (없으면 역 이름으로 OSM 공사 중·계획 역을 찾는다)
export const LINES = [
  {
    id: 'sinansan', name: '신안산선', status: '공사 중', open: '2028년 12월 목표',
    source: 'https://ko.wikipedia.org/wiki/신안산선',
    stations: [
      ['여의도', 'transfer'], ['영등포', 'transfer'], ['도림사거리', 'new', '도림사거리'], ['신풍', 'transfer'],
      ['대림삼거리', 'new', '대림삼거리'], ['구로디지털단지', 'transfer'], ['신독산', 'new', '독산동, 금천구'],
      ['시흥사거리', 'new', '시흥사거리, 금천구'], ['석수', 'transfer'], ['광명', 'transfer', '광명역, 일직동'],
      ['목감', 'new', '목감동, 시흥시'], ['성포', 'new', '성포동, 안산시'], ['중앙', 'transfer'],
      ['안산시청', 'new', '안산시청'], ['한양대', 'new', '한양대학교 ERICA'],
    ],
  },
  {
    id: 'wolpan', name: '월곶판교선', status: '공사 중', open: '2029년 12월 목표',
    source: 'https://ko.wikipedia.org/wiki/월곶-판교선',
    stations: [
      ['월곶', 'transfer'], ['장곡', 'new'], ['시흥시청', 'transfer'], ['매화', 'new'], ['학온', 'new'], ['광명', 'transfer', '광명역, 일직동'],
      ['만안', 'new'], ['안양', 'transfer'], ['안양운동장', 'new'], ['인덕원', 'transfer'], ['청계', 'new'], ['서판교', 'new'], ['판교', 'transfer'],
    ],
  },
  {
    id: 'dongin', name: '동탄인덕원선', status: '공사 중', open: '2028년 12월 목표',
    source: 'https://ko.wikipedia.org/wiki/동탄인덕원선',
    stations: [
      ['인덕원', 'transfer'], ['안양농수산물시장', 'new', '안양농수산물도매시장'], ['호계', 'new', '호계동, 안양시'], ['오전', 'new', '오전동, 의왕시'],
      ['의왕시청', 'new', '의왕시청'], ['북수원', 'new', '정자동, 장안구, 수원시'], ['장안구청', 'new', '장안구청'],
      ['수원월드컵경기장', 'new', '수원월드컵경기장'], ['아주대입구', 'new', '아주대학교'], ['광교원천', 'new', '원천동, 영통구'],
      ['흥덕', 'new', '영덕동, 기흥구'], ['영통', 'transfer'], ['서천', 'new', '서천동, 기흥구'], ['능동', 'new', '능동, 화성시'],
      ['반송', 'new', '반송동, 화성시'], ['동탄', 'transfer', '동탄역'],
    ],
  },
  {
    id: 'dongbuk', name: '동북선', status: '공사 중', open: '2027년 11월 목표',
    source: 'https://v.daum.net/v/47pjuODgJY',
    // 역 목록·좌표는 OSM 의 공사 중 역(운영사 로템SRS)을 그대로 쓴다
    osmOperator: '로템SRS',
    stations: [],
  },
  {
    id: 'gtxb', name: 'GTX-B', status: '공사 중', open: '2031년 목표',
    source: 'https://ko.wikipedia.org/wiki/수도권_광역급행철도_B선',
    stations: [
      ['마석', 'transfer'], ['평내호평', 'transfer'], ['별내', 'transfer'], ['상봉', 'transfer'], ['청량리', 'transfer'], ['서울', 'transfer', '서울역'],
      ['용산', 'transfer'], ['여의도', 'transfer'], ['신도림', 'transfer'], ['부천종합운동장', 'transfer'], ['부평', 'transfer'],
      ['인천시청', 'transfer'], ['인천대입구', 'transfer'],
    ],
  },
  {
    id: 'gtxc', name: 'GTX-C', status: '공사 중', open: '2028년 목표, 지연 전망',
    source: 'https://ko.wikipedia.org/wiki/수도권_광역급행철도_C선',
    stations: [
      ['덕정', 'transfer'], ['의정부', 'transfer'], ['창동', 'transfer'], ['광운대', 'transfer'], ['청량리', 'transfer'], ['왕십리', 'transfer'],
      ['삼성', 'transfer'], ['양재', 'transfer'], ['정부과천청사', 'transfer'], ['인덕원', 'transfer'], ['금정', 'transfer'], ['의왕', 'transfer'],
      ['수원', 'transfer'],
    ],
  },
  {
    id: 'wirye', name: '위례선(트램)', status: '공사 중', open: '2026년 12월 개통 예정',
    source: 'https://ko.wikipedia.org/wiki/위례선',
    stations: [
      ['마천', 'transfer'], ['덕수고등학교', 'new', '덕수고등학교, 송파구'], ['위례호수공원', 'new', '위례호수공원'], ['위례중앙광장', 'new', '위례중앙광장'],
      ['복정', 'transfer'], ['남위례', 'transfer'],
    ],
  },
  {
    id: 'line9', name: '9호선 연장', status: '공사 중', open: '2028년 7월 목표',
    source: 'https://ko.wikipedia.org/wiki/서울_지하철_9호선',
    stations: [['길동생태공원', 'new', '길동생태공원'], ['한영중고교', 'new', '한영고등학교'], ['고덕', 'transfer'], ['고덕비즈밸리', 'new', '고덕비즈밸리']],
  },
];

const UA = { 'User-Agent': 'cheongyak-alarm/1.0 (https://sj-gates.github.io/cheongyak-alarm)', 'Accept-Language': 'ko' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(q) {
  // 요청 제한(429)·바쁨이면 잠깐 쉬었다 다른 서버로
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } });
      const txt = await res.text();
      if (txt.startsWith('{')) return JSON.parse(txt).elements;
      console.log(`  overpass ${res.status} (${new URL(url).host}), 다시 시도`);
    } catch (e) {
      console.log(`  overpass 오류 (${new URL(url).host}): ${e.message}`);
    }
    await sleep(15000);
  }
  throw new Error('overpass 실패');
}
async function nominatim(q) {
  await sleep(1100); // 사용 규칙: 초당 1번
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(q)}`, { headers: UA });
  const j = await r.json();
  return j[0] ? { lat: +(+j[0].lat).toFixed(5), lng: +(+j[0].lon).toFixed(5), where: j[0].display_name.split(', ').slice(0, 4).join(', ') } : null;
}

const BBOX = '(36.9,126.3,38.3,127.9)';
const nameOf = (t) => (t['name:ko'] ?? t.name ?? '').replace(/역$/, '').trim();
// 이미 있는 역 (지하철·전철·기차) 과 공사 중·계획 역
const existing = await overpass(`[out:json][timeout:180];(node["railway"~"station|halt"]${BBOX};node["public_transport"="station"]${BBOX};);out;`);
const planned = await overpass(`[out:json][timeout:120];(
  node["railway"="construction"]["construction"~"station|halt"]${BBOX};
  node["construction:railway"~"station|halt"]${BBOX};
  node["railway"="proposed"]["proposed"~"station|halt"]${BBOX};
  node["proposed:railway"~"station|halt"]${BBOX};);out;`);
console.log('OSM 역', existing.length, '공사·계획 역', planned.length);

const out = [];
for (const line of LINES) {
  const stations = [];
  if (line.osmOperator) {
    for (const e of planned.filter((p) => p.tags.operator === line.osmOperator && /^[가-힣]/.test(nameOf(p.tags)))) {
      stations.push({ name: nameOf(e.tags), kind: 'new', lat: +e.lat.toFixed(5), lng: +e.lon.toFixed(5), from: 'osm-planned' });
    }
  }
  for (const [name, kind, q] of line.stations) {
    let hit = null;
    if (kind === 'transfer' && !q) {
      const cands = existing.filter((e) => nameOf(e.tags) === name && /subway|train|light_rail|yes/.test(e.tags.station ?? e.tags.train ?? e.tags.subway ?? 'yes'));
      if (cands.length) hit = { lat: +cands[0].lat.toFixed(5), lng: +cands[0].lon.toFixed(5), where: `OSM 역 ${cands.length}곳 중 첫째`, from: 'osm-station' };
    }
    if (!hit && kind === 'new' && !q) {
      const p = planned.find((e) => nameOf(e.tags) === name);
      if (p) hit = { lat: +p.lat.toFixed(5), lng: +p.lon.toFixed(5), where: 'OSM 공사·계획 역', from: 'osm-planned' };
    }
    if (!hit) {
      const g = await nominatim(q ?? `${name}역`);
      if (g) hit = { ...g, from: 'landmark' };
    }
    // 동네 이름으로 찾은 새 역(예: '목감동, 시흥시')은 대략 위치
    const approx = kind === 'new' && !!q && /^[가-힣0-9]+(동|읍|면), /.test(q);
    if (hit) stations.push({ name, kind, lat: hit.lat, lng: hit.lng, ...(approx ? { approx: true } : {}), from: hit.from, where: hit.where });
    else console.log(`! 못 찾음: ${line.name} ${name}`);
  }
  out.push({ id: line.id, name: line.name, status: line.status, open: line.open, source: line.source, stations });
  for (const s of stations) console.log(`${line.name.padEnd(8)} ${s.name.padEnd(10)} ${s.kind.padEnd(8)} ${s.lat},${s.lng}  ${s.from}  ${s.where ?? ''}`);
}
fs.mkdirSync('scripts/data', { recursive: true });
fs.writeFileSync('scripts/data/rail-plans.json', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), attribution: '© OpenStreetMap contributors', lines: out.map((l) => ({ ...l, stations: l.stations.map(({ where, from, ...s }) => s) })) }, null, 1));
console.log('scripts/data/rail-plans.json');
