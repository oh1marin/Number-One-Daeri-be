import { Router } from 'express';
import appAuth from '../appAuth';
import notices from './notices';
import users from './users';
import rides from './rides';
import mileage from './mileage';
import withdrawals from './withdrawals';
import cards from './cards';
import payments from './payments';
import referrals from './referrals';
import inquiries from './inquiries';
import contact from './contact';
import faqs from './faqs';
import coupons from './coupons';
import complaints from './complaints';
import events from './events';
import ads from './ads';
import banks from './banks';
import geocode from './geocode';
import ai from './ai';
import receipts from './receipts';
import storage from './storage';
import { userAuthMiddleware } from '../../middleware/userAuth';

const router = Router();

// 연동 테스트 (Flutter ↔ 백엔드)
router.get('/connect-test', (_req, res) => {
  res.json({ connected: true, message: 'Flutter ↔ 백엔드 연동됨' });
});

// 공개
router.use('/auth', appAuth);

// 공지사항 — 공개
router.use('/notices', notices);

// 이벤트 — 공개
router.use('/events', events);

// 광고설정 — 공개
router.use('/ads', ads);

// 은행 목록 — 공개
router.use('/banks', banks);

// 역지오코딩 (선택)
router.use('/geocode', geocode);

// 상담문의 — 공개 (비로그인)
router.use('/contact', contact);

// 자주하는질문 — 공개
router.use('/faqs', faqs);

// 인증 필요 (앱 사용자)
router.use(userAuthMiddleware);
router.use('/users', users);
router.use('/rides', rides);
router.use('/mileage', mileage);
router.use('/withdrawals', withdrawals);
router.use('/cards', cards);
router.use('/payments', payments);
router.use('/referrals', referrals);
router.use('/inquiries', inquiries);
router.use('/complaints', complaints);
router.use('/coupons', coupons);
router.use('/receipts', receipts);
router.use('/storage', storage);
router.use('/ai', ai);

export default router;
