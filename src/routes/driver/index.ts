import { Router } from 'express';
import driverAuth from '../driverAuth';
import location from './location';
import rides from './rides';
import { driverAuthMiddleware } from '../../middleware/driverAuth';

const router = Router();

// 공개
router.use('/auth', driverAuth);

// 인증 필요
router.use(driverAuthMiddleware);
router.use('/me', location);
router.use('/rides', rides);

export default router;
