import React from 'react';
import { Loader2, FileSpreadsheet } from 'lucide-react';

interface UploadProgressModalProps {
  isOpen: boolean;
  fileName?: string;
  stage?: string;
}

export const UploadProgressModal: React.FC<UploadProgressModalProps> = ({ isOpen, fileName, stage }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in-95">
        <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Uploading Purchase Order Data</h2>
          {fileName && (
            <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1.5 justify-center">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {fileName}
            </p>
          )}
        </div>
        <p className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 w-full">
          {stage || 'Processing...'}
        </p>
        <p className="text-[11px] text-slate-400">Please don't close or refresh this tab until it finishes.</p>
      </div>
    </div>
  );
};
