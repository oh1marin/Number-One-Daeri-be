import { Router } from 'express';
import customers from './customers';
import drivers from './drivers';
import rides from './rides';
import attendance from './attendance';
import invoices from './invoices';
import settings from './settings';
import dashboard from './dashboard';

const router = Router();

router.use('/dashboard', dashboard);
router.use('/customers', customers);
router.use('/drivers', drivers);
router.use('/rides', rides);
router.use('/attendance', attendance);
router.use('/invoices', invoices);
router.use('/settings', settings);

export default router;
