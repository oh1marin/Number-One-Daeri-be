import axios from 'axios';

const KAKAO_REST_KEY = process.env.KAKAO_REST_API_KEY;

export interface KakaoAddressResult {
  address: string;
  addressDetail: string;
  region: string;
}

/**
 * Kakao 좌표→주소 (역지오코딩)
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#coord-to-address
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<KakaoAddressResult> {
  if (!KAKAO_REST_KEY) {
    return { address: '', addressDetail: '', region: '' };
  }

  try {
    const res = await axios.get(
      'https://dapi.kakao.com/v2/local/geo/coord2address.json',
      {
        params: { x: lng, y: lat },
        headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
        timeout: 5000,
      }
    );

    const doc = res.data?.documents?.[0];
    if (!doc) {
      return { address: '', addressDetail: '', region: '' };
    }

    const road = doc.road_address;
    const addr = doc.address;

    const address = road?.address_name ?? addr?.address_name ?? '';
    const addressDetail = road?.building_name ?? addr?.region_3depth_h_name ?? '';
    const region =
      [addr?.region_1depth_name, addr?.region_2depth_name]
        .filter(Boolean)
        .join(' ') ?? '';

    return { address, addressDetail, region };
  } catch {
    return { address: '', addressDetail: '', region: '' };
  }
}

/** Kakao 주소 검색 API 응답 아이템 */
export interface AddressSearchItem {
  address_name: string;
  address_type: string;
  x: string;
  y: string;
  address?: { address_name: string };
  road_address?: { address_name: string; building_name?: string };
}

/**
 * Kakao 주소 검색 (키워드 → 주소/좌표)
 * 전국 모든 지역 검색 가능. 별도 등록 불필요.
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord
 */
export async function searchAddress(
  query: string,
  options?: { page?: number; size?: number }
): Promise<{ items: AddressSearchItem[]; totalCount: number; isEnd: boolean }> {
  if (!KAKAO_REST_KEY || !query?.trim()) {
    return { items: [], totalCount: 0, isEnd: true };
  }

  try {
    const res = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
      params: {
        query: query.trim(),
        page: options?.page ?? 1,
        size: Math.min(30, options?.size ?? 10),
      },
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
      timeout: 5000,
    });

    const docs = res.data?.documents ?? [];
    const meta = res.data?.meta ?? {};

    return {
      items: docs,
      totalCount: meta.total_count ?? 0,
      isEnd: meta.is_end ?? true,
    };
  } catch {
    return { items: [], totalCount: 0, isEnd: true };
  }
}

/**
 * Kakao 키워드로 장소 검색 (장소명, 상호명 등)
 * "서울역", "스타벅스 강남점" 등
 * https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-keyword
 */
export async function searchKeyword(
  query: string,
  options?: { page?: number; size?: number }
): Promise<{ items: Array<{ place_name: string; address_name: string; x: string; y: string }>; totalCount: number; isEnd: boolean }> {
  if (!KAKAO_REST_KEY || !query?.trim()) {
    return { items: [], totalCount: 0, isEnd: true };
  }

  try {
    const res = await axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
      params: {
        query: query.trim(),
        page: options?.page ?? 1,
        size: Math.min(15, options?.size ?? 10),
      },
      headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
      timeout: 5000,
    });

    const docs = res.data?.documents ?? [];
    const meta = res.data?.meta ?? {};

    const items = docs.map((d: { place_name?: string; address_name?: string; x?: string; y?: string }) => ({
      place_name: d.place_name ?? '',
      address_name: d.address_name ?? '',
      x: d.x ?? '',
      y: d.y ?? '',
    }));

    return {
      items,
      totalCount: meta.total_count ?? 0,
      isEnd: meta.is_end ?? true,
    };
  } catch {
    return { items: [], totalCount: 0, isEnd: true };
  }
}
