import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  const appUrl = process.env.APP_URL || '';
  res.json({ success: true, devUrl: appUrl, sharedUrl: appUrl, appUrl });
});

export default router;
