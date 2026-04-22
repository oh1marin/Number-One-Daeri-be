import { Router } from 'express';
import appRouter from './app';
import adminRouter from './admin';
import driverRouter from './driver';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      message: '일등대리 API v1',
      version: '0.1.0',
      app: ['/auth', '/notices', '/contact', '/faqs', '/users', '/push-tokens', '/rides', '/mileage', '/withdrawals', '/cards', '/payments', '/referrals', '/inquiries', '/complaints', '/coupons', '/receipts/cash', '/events', '/geocode', '/storage/presign-put', '/ai/chat'],
      driver: ['/driver/auth', '/driver/me/location', '/driver/rides'],
      admin: ['/admin/auth', '/admin/dashboard', '/admin/customers', '/admin/drivers', '/admin/rides', '/admin/attendance', '/admin/invoices', '/admin/settings', '/admin/notices', '/admin/faqs', '/admin/inquiries', '/admin/complaints', '/admin/withdrawals', '/admin/coupons', '/admin/coupon-requests', '/admin/users', '/admin/app-install', '/admin/app-install-stats', '/admin/order-stats', '/admin/number-change', '/admin/recommendation-kings', '/admin/referrals', '/admin/sms', '/admin/storage/presign-put', '/admin/uploads/presign'],
    },
  });
});

// 관리대장 웹 (Admin) — /admin 먼저 (안 하면 appRouter의 / 가 먼저 매칭됨)
router.use('/admin', adminRouter);

// 기사 앱 (Driver)
router.use('/driver', driverRouter);

// Flutter 앱 (User)
router.use('/', appRouter);

export default router;
