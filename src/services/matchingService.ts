import { prisma } from '../lib/prisma';
import { haversineKm } from '../utils/geo';

const RADIUS_KM = 10; // 배차 반경

export interface NearestDriver {
  id: string;
  name: string;
  phone: string | null;
  distanceKm: number;
}

/**
 * 고객 위치 기준 반경 내 온라인 기사 목록 (거리순)
 */
export async function findNearbyDrivers(
  lat: number,
  lng: number,
  limit = 10
): Promise<NearestDriver[]> {
  const drivers = await prisma.driver.findMany({
    where: {
      isOnline: true,
      currentLat: { not: null },
      currentLng: { not: null },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      currentLat: true,
      currentLng: true,
    },
  });

  const withDistance = drivers
    .filter((d) => d.currentLat != null && d.currentLng != null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      phone: d.phone,
      distanceKm: haversineKm(lat, lng, d.currentLat!, d.currentLng!),
    }))
    .filter((d) => d.distanceKm <= RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return withDistance;
}
