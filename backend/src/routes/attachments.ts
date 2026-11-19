import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { Attachment } from '../models/Attachment';
import { requireAuth } from '../middleware/auth';

const router = Router();

const ATTACHMENTS_DIR = path.resolve(process.env.ATTACHMENTS_DIR || './data/attachments');
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

router.post('/upload', requireAuth, async (req, res) => {
  try {
    const { name, data, type, caption, uploadedBy, ownerType, ownerId } = req.body || {};
    if (!data) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const extMatch = (name || '').match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : type?.includes('png') ? 'png' : type?.includes('webp') ? 'webp' : 'jpg';
    const safeFilename = `${id}.${ext}`;
    const filePath = path.join(ATTACHMENTS_DIR, safeFilename);

    const base64Data = String(data).replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    const attachment = await Attachment.create({
      id,
      name: name || `attachment_${id}.${ext}`,
      url: `/api/attachments/${safeFilename}`,
      size: buffer.length,
      mimeType: type || `image/${ext}`,
      uploadedBy: uploadedBy || req.user?.name || 'Unknown',
      caption: caption || '',
      ownerType: ownerType || null,
      ownerId: ownerId || null,
    });

    res.json({ success: true, attachment });
  } catch (err: any) {
    console.error('Error saving image attachment:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save attachment' });
  }
});

export { ATTACHMENTS_DIR };
export default router;
