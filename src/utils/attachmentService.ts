import { DocumentAttachment } from '../types';
import { API_BASE } from './authToken';

/**
 * Compresses an image file on the client using HTMLCanvas to keep payloads lightweight,
 * fast to transfer, and clear for document reading.
 */
export const compressImage = (
  file: File,
  maxWidth: number = 1600,
  maxHeight: number = 1600,
  quality: number = 0.85
): Promise<{ dataUrl: string; size: number }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve({ dataUrl: e.target?.result as string, size: file.size });
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        // Estimate byte size from base64 string
        const base64Len = dataUrl.length - (dataUrl.indexOf(',') + 1);
        const approxBytes = Math.round((base64Len * 3) / 4);

        resolve({ dataUrl, size: approxBytes });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

/**
 * Uploads an image file to the persistent server endpoint with fallback to data URL.
 */
export const uploadAttachmentImage = async (
  file: File,
  caption?: string,
  uploadedBy?: string
): Promise<DocumentAttachment> => {
  try {
    const { dataUrl, size } = await compressImage(file);

    // Try posting to server endpoint
    try {
      const response = await fetch(`${API_BASE}/api/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          data: dataUrl,
          type: file.type || 'image/jpeg',
          caption: caption || '',
          uploadedBy: uploadedBy || 'User',
        }),
      });

      if (response.ok) {
        const json = await response.json();
        if (json.success && json.attachment) {
          return json.attachment;
        }
      }
    } catch (networkErr) {
      console.warn('Network upload to /api/attachments/upload failed, using local dataUrl:', networkErr);
    }

    // Fallback if offline or server endpoint error
    return {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      name: file.name,
      url: dataUrl,
      size,
      type: file.type || 'image/jpeg',
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploadedBy || 'User',
      caption: caption || '',
    };
  } catch (err: any) {
    console.error('Error processing attachment image:', err);
    throw err;
  }
};

/**
 * Formats byte count to readable string (e.g. "145 KB", "1.2 MB")
 */
export const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
