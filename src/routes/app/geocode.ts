import { Router } from 'express';
import { reverseGeocode, searchAddress, searchKeyword } from '../../lib/kakao';

const router = Router();

// GET /geocode/reverse — 위경도 → 주소 (Kakao REST API)
router.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, error: 'lat, lng 필수 (숫자)' });
  }
  const data = await reverseGeocode(lat, lng);
  res.json({ success: true, data });
});

// GET /geocode/search — 주소 검색 (키워드 → 주소/좌표, 전국 모든 지역)
// query=서울역, query=강남구 테헤란로 등
router.get('/search', async (req, res) => {
  const query = (req.query.query as string)?.trim();
  if (!query) {
    return res.status(400).json({ success: false, error: 'query 필수' });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(30, Math.max(1, Number(req.query.size) || 10));

  const { items, totalCount, isEnd } = await searchAddress(query, { page, size });

  const data = items.map((doc) => ({
    address_name: doc.address_name,
    address_type: doc.address_type,
    x: doc.x,
    y: doc.y,
    lng: doc.x,
    lat: doc.y,
    address: doc.address?.address_name,
    road_address: doc.road_address?.address_name,
    building_name: doc.road_address?.building_name,
  }));

  res.json({ success: true, data: { items: data, totalCount, isEnd } });
});

// GET /geocode/keyword — 장소명 검색 ("서울역", "스타벅스 강남점" 등)
router.get('/keyword', async (req, res) => {
  const query = (req.query.query as string)?.trim();
  if (!query) {
    return res.status(400).json({ success: false, error: 'query 필수' });
  }
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(15, Math.max(1, Number(req.query.size) || 10));

  const { items, totalCount, isEnd } = await searchKeyword(query, { page, size });

  res.json({ success: true, data: { items, totalCount, isEnd } });
});

export default router;
