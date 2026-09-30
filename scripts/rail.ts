/**
 * 공고 근처의 공사 중·개통 예정 노선 역 (scripts/data/rail-plans.json, 만드는 법은 scripts/make-rail-plans.mjs).
 * 노선마다 가장 가까운 역 하나씩, 가까운 순으로.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface RailPlanStation {
  name: string;
  kind: 'new' | 'transfer'; // 새로 생기는 역 / 이미 있는 역에 노선이 더해짐
  lat: number;
  lng: number;
  approx?: boolean; // 역 위치가 동네 중심 정도로만 알려진 경우
}
interface RailPlanLine {
  id: string;
  name: string;
  status: string;
  open: string;
  source: string;
  stations: RailPlanStation[];
}
export interface NearPlan {
  line: string;
  status: string;
  open: string;
  source: string;
  station: RailPlanStation;
  distance: number; // m
}

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'rail-plans.json'), 'utf8')) as { updated: string; lines: RailPlanLine[] };
export const RAIL_PLANS_UPDATED = DATA.updated;

/** 두 좌표 사이 직선거리 (m) */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** 반경 안의 예정 노선 (노선마다 가장 가까운 역), 가까운 순 최대 3개 */
export function nearbyPlans(lat: number, lng: number, radius: number): NearPlan[] {
  const out: NearPlan[] = [];
  for (const line of DATA.lines) {
    let best: NearPlan | null = null;
    for (const s of line.stations) {
      const d = distanceM(lat, lng, s.lat, s.lng);
      if (d <= radius && (!best || d < best.distance)) best = { line: line.name, status: line.status, open: line.open, source: line.source, station: s, distance: d };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, 3);
}
