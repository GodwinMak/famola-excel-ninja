import { Router } from 'express';
import path from 'path';
import { ZipArchive } from 'archiver';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();

// Folders/files that never belong in a source export (deps, build output, secrets, user data).
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.env', '**/.env.*', '**/data/**', '**/*.zip', '**/*.log'];

router.get('/', requireAuth, requireAdmin, (_req, res) => {
  // backend/ is cwd when started via npm scripts; the project root is one level up.
  const projectRoot = path.resolve(process.cwd(), '..');
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err: Error) => {
    console.error('Source zip failed:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to generate source zip' });
    else res.end();
  });
  res.attachment('famola-erp-source-code.zip');
  archive.pipe(res);
  archive.glob('**/*', { cwd: projectRoot, ignore: IGNORE, dot: true });
  archive.glob('.env.example', { cwd: projectRoot });
  archive.glob('*/.env.example', { cwd: projectRoot });
  archive.finalize();
});

export default router;
