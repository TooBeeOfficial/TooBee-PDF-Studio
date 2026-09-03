import { PDFDocument } from 'pdf-lib';
import { normalizeToPdf } from './fileConverter';

/**
 * Appends one or more files to the end of the document already open.
 *
 * Opening a file while something is already loaded used to throw that work
 * away. Appending instead means the "add" buttons build up a stack, and page
 * numbers of anything already placed stay valid because new pages only ever go
 * on the end.
 *
 * Anything `normalizeToPdf` accepts can be added, not just PDFs.
 *
 * @param baseBytes the document currently open
 * @param files     files to convert and append, in the order given
 * @returns the combined document
 */
export async function appendPdf(baseBytes: Uint8Array, files: File[]): Promise<Uint8Array> {
  // slice(0) because pdf-lib takes ownership of the buffer it is handed, and
  // these bytes are still referenced by the store.
  const base = await PDFDocument.load(baseBytes.slice(0));

  for (const file of files) {
    const buffer = await normalizeToPdf(file);
    const incoming = await PDFDocument.load(buffer);
    const copied = await base.copyPages(incoming, incoming.getPageIndices());
    copied.forEach(page => base.addPage(page));
  }

  return base.save();
}
