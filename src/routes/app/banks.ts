import { Router } from 'express';

const router = Router();

const BANKS = [
  { code: '004', name: 'KB국민은행' },
  { code: '020', name: '우리은행' },
  { code: '081', name: 'KEB하나은행' },
  { code: '088', name: '신한은행' },
  { code: '011', name: 'NH농협은행' },
  { code: '003', name: '기업은행' },
  { code: '027', name: '한국씨티은행' },
  { code: '071', name: '우체국' },
  { code: '037', name: '전북은행' },
  { code: '035', name: '제주은행' },
  { code: '032', name: '부산은행' },
  { code: '039', name: '경남은행' },
  { code: '045', name: '새마을금고' },
  { code: '007', name: '수협은행' },
  { code: '048', name: '신협' },
  { code: '050', name: '상호저축은행' },
];

// GET /banks
router.get('/', (req, res) => {
  res.json({ success: true, data: BANKS });
});

export default router;
