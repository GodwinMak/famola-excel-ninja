import React, { useState, useRef } from 'react';
import { DocumentAttachment, AppUser } from '../types';
import { uploadAttachmentImage, formatFileSize } from '../utils/attachmentService';
import { 
  Paperclip, 
  UploadCloud, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  Download, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  X, 
  Loader2,
  FileText,
  Plus,
  Check
} from 'lucide-react';

interface ImageAttachmentManagerProps {
  attachments: DocumentAttachment[];
  onChange?: (updated: DocumentAttachment[]) => void;
  readOnly?: boolean;
  title?: string;
  description?: string;
  currentUser?: AppUser;
  compact?: boolean;
}

export const ImageAttachmentManager: React.FC<ImageAttachmentManagerProps> = ({
  attachments = [],
  onChange,
  readOnly = false,
  title = 'Attached Pictures / Images',
  description = 'Attach scanned document, stamped copy, physical receipt, or inspection photos (PNG, JPG, WEBP).',
  currentUser,
  compact = false,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Lightbox Modal State
  const [activePreview, setActivePreview] = useState<DocumentAttachment | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [rotationDeg, setRotationDeg] = useState<number>(0);

  // Inline caption editing
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [captionDraft, setCaptionDraft] = useState<string>('');

  const handleFileProcess = async (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return;
    setIsUploading(true);
    setUploadError(null);

    const newAttachments: DocumentAttachment[] = [];
    const uploaderName = currentUser ? `${currentUser.name} (${currentUser.role})` : 'User';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) {
        setUploadError(`File "${file.name}" is not an image. Please upload PNG, JPG, or WEBP images.`);
        continue;
      }

      try {
        const item = await uploadAttachmentImage(file, '', uploaderName);
        newAttachments.push(item);
      } catch (err: any) {
        console.error('Error uploading file:', file.name, err);
        setUploadError(`Failed to process image "${file.name}".`);
      }
    }

    if (newAttachments.length > 0 && onChange) {
      onChange([...attachments, ...newAttachments]);
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly || !onChange) return;
    onChange(attachments.filter((a) => a.id !== idToRemove));
    if (activePreview?.id === idToRemove) {
      setActivePreview(null);
    }
  };

  const handleSaveCaption = (id: string) => {
    if (readOnly || !onChange) return;
    const updated = attachments.map((a) =>
      a.id === id ? { ...a, caption: captionDraft.trim() } : a
    );
    onChange(updated);
    setEditingCaptionId(null);
    setCaptionDraft('');
  };

  const openLightbox = (att: DocumentAttachment) => {
    setActivePreview(att);
    setZoomLevel(1);
    setRotationDeg(0);
  };

  return (
    <div className="space-y-3">
      {/* Header with Title & Count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">{title}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
            {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Image
          </button>
        )}
      </div>

      {!compact && description && (
        <p className="text-[11px] text-slate-500">{description}</p>
      )}

      {/* Hidden File Input */}
      {!readOnly && (
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          multiple
          onChange={(e) => handleFileProcess(e.target.files)}
          className="hidden"
        />
      )}

      {/* Drag & Drop Upload Zone (shown if not readOnly) */}
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFileProcess(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-3.5 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-blue-500 bg-blue-50/60'
              : 'border-slate-200 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          {isUploading ? (
            <div className="flex items-center justify-center gap-2 text-xs text-blue-600 py-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Compressing and uploading image(s)...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2.5 text-xs text-slate-600">
              <UploadCloud className="w-4 h-4 text-blue-500" />
              <span>
                <strong className="text-blue-600">Click to upload</strong> or drag and drop pictures / photos here
              </span>
              <span className="text-[10px] text-slate-400 font-mono">(PNG, JPG, WEBP)</span>
            </div>
          )}
        </div>
      )}

      {uploadError && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
          {uploadError}
        </div>
      )}

      {/* Thumbnails Gallery */}
      {attachments.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pt-1">
          {attachments.map((att) => {
            const isEditingCaption = editingCaptionId === att.id;
            return (
              <div
                key={att.id}
                className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                {/* Image Container with Hover Overlay */}
                <div
                  className="relative aspect-4/3 bg-slate-100 cursor-pointer overflow-hidden flex items-center justify-center"
                  onClick={() => openLightbox(att)}
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 text-white">
                    <span className="p-1.5 rounded-full bg-black/60 hover:bg-black/90">
                      <Eye className="w-4 h-4" />
                    </span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="p-2 space-y-1 text-left bg-white">
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className="text-[11px] font-bold text-slate-800 truncate block max-w-[130px]"
                      title={att.name}
                    >
                      {att.name}
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => handleRemove(att.id, e)}
                        className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer transition-colors"
                        title="Remove image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{formatFileSize(att.size)}</span>
                    <span>{new Date(att.uploadedAt).toLocaleDateString()}</span>
                  </div>

                  {/* Caption display / edit */}
                  {isEditingCaption ? (
                    <div className="pt-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={captionDraft}
                        onChange={(e) => setCaptionDraft(e.target.value)}
                        placeholder="Add caption..."
                        className="w-full text-[10px] px-1.5 py-0.5 border border-blue-400 rounded focus:outline-none"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCaption(att.id)}
                        className="p-1 bg-blue-600 text-white rounded cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="pt-0.5">
                      {att.caption ? (
                        <p
                          className="text-[10px] text-slate-600 truncate italic cursor-pointer"
                          title={att.caption}
                          onClick={() => {
                            if (!readOnly) {
                              setEditingCaptionId(att.id);
                              setCaptionDraft(att.caption || '');
                            }
                          }}
                        >
                          "{att.caption}"
                        </p>
                      ) : !readOnly ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCaptionId(att.id);
                            setCaptionDraft('');
                          }}
                          className="text-[10px] text-blue-500 hover:underline cursor-pointer"
                        >
                          + Add caption
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : readOnly ? (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-400">
          No pictures or images attached.
        </div>
      ) : null}

      {/* Lightbox Modal */}
      {activePreview && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setActivePreview(null)}
        >
          {/* Lightbox Top Control Bar */}
          <div
            className="w-full max-w-5xl flex items-center justify-between pb-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col">
              <span className="text-sm font-bold truncate max-w-md">{activePreview.name}</span>
              {activePreview.caption && (
                <span className="text-xs text-slate-300 italic">"{activePreview.caption}"</span>
              )}
              <span className="text-[11px] text-slate-400">
                {formatFileSize(activePreview.size)} • Uploaded {new Date(activePreview.uploadedAt).toLocaleString()}
                {activePreview.uploadedBy ? ` by ${activePreview.uploadedBy}` : ''}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotationDeg((r) => (r + 90) % 360)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
                title="Rotate 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <a
                href={activePreview.url}
                download={activePreview.name}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer inline-flex items-center gap-1 text-xs"
                title="Download image"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => setActivePreview(null)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lightbox Image Stage */}
          <div
            className="relative max-w-5xl max-h-[80vh] overflow-auto flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={activePreview.url}
              alt={activePreview.name}
              className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-200"
              style={{
                transform: `scale(${zoomLevel}) rotate(${rotationDeg}deg)`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
