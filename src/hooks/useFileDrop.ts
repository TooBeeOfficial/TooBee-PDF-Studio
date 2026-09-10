import { useCallback, useRef, useState } from 'react';

/**
 * Makes a whole page a drop target for files.
 *
 * Dropping already worked in two places — the empty stage, and the uploader in
 * the sidebar — but both are small targets, and once a document was open the
 * empty stage was gone entirely. Dropping a second file anywhere over the page
 * did nothing, which is the moment you most want it to work.
 *
 * Two details matter more than they look:
 *
 * `dragenter` and `dragleave` fire for every element the pointer crosses, not
 * just the one the handler sits on, so tracking a boolean makes the overlay
 * flicker as the cursor passes over children. Counting enters against leaves is
 * the usual fix and the only one that survives a page full of nested nodes.
 *
 * The check for a `Files` entry in `dataTransfer.types` is what keeps this from
 * hijacking the page-reordering drag in Rotate. That drag carries no files, so
 * the two never contend.
 */

export interface FileDropProps {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export interface FileDrop {
  /** Spread onto the element that should accept files. */
  dropProps: FileDropProps;
  /** True while a file is being dragged over it. */
  isDragging: boolean;
}

function carriesFiles(e: React.DragEvent): boolean {
  const types = e.dataTransfer?.types;
  if (!types) return false;
  // DataTransfer.types is a DOMStringList in older engines, so no .includes().
  return Array.prototype.indexOf.call(types, 'Files') !== -1;
}

export function useFileDrop(onFiles: ((files: File[]) => void) | undefined): FileDrop {
  const [isDragging, setIsDragging] = useState(false);
  const depth = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!onFiles || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, [onFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!onFiles || !carriesFiles(e)) return;
    // Without preventDefault on dragover the drop event never fires at all, and
    // the browser falls back to navigating to the dropped file.
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, [onFiles]);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!onFiles || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, [onFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    if (!onFiles || !carriesFiles(e)) return;
    e.preventDefault();
    depth.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) onFiles(files);
  }, [onFiles]);

  return { dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop }, isDragging };
}
