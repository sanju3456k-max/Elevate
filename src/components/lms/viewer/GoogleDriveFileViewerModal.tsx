import React from 'react';
import { NativeDocumentViewer, type DocumentViewerItem } from './NativeDocumentViewer';

export type DriveViewerItem = DocumentViewerItem;

export interface GoogleDriveFileViewerModalProps {
  items: DriveViewerItem[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modern In-App Document Viewer for Course Notes, PDFs, and Images.
 * Seamlessly replaces third-party Google Drive iframes with high-DPI
 * hardware-accelerated canvas rendering and multi-touch gestures.
 */
export const GoogleDriveFileViewerModal: React.FC<GoogleDriveFileViewerModalProps> = ({
  items,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  return (
    <NativeDocumentViewer
      items={items}
      initialIndex={initialIndex}
      isOpen={isOpen}
      onClose={onClose}
    />
  );
};

export default GoogleDriveFileViewerModal;
