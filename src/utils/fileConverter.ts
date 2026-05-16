import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import html2canvas from 'html2canvas';

export async function normalizeToPdf(file: File): Promise<Uint8Array> {
  const type = file.type;
  const name = file.name.toLowerCase();

  // 1. PDF
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return new Uint8Array(await file.arrayBuffer());
  }

  // 2. Images (JPG, PNG supported natively by pdf-lib)
  if (type === 'image/jpeg' || type === 'image/png' || name.endsWith('.jpg') || name.endsWith('.png')) {
    const pdfDoc = await PDFDocument.create();
    const imageBytes = await file.arrayBuffer();
    
    let image;
    if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else {
      image = await pdfDoc.embedPng(imageBytes);
    }
    
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return await pdfDoc.save();
  }

  // 3. Other Images (GIF, BMP, TIFF, WEBP) -> Draw to canvas and convert to JPEG
  if (type.startsWith('image/')) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    
    // Convert to JPEG
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const jpegBytes = await fetch(jpegDataUrl).then(r => r.arrayBuffer());
    
    const pdfDoc = await PDFDocument.create();
    const pdfImage = await pdfDoc.embedJpg(jpegBytes);
    const page = pdfDoc.addPage([pdfImage.width, pdfImage.height]);
    page.drawImage(pdfImage, { x: 0, y: 0, width: pdfImage.width, height: pdfImage.height });
    return await pdfDoc.save();
  }

  // 4. Text (.txt)
  if (type === 'text/plain' || name.endsWith('.txt')) {
    const text = await file.text();
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 12;
    
    // A4 size
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 50;
    const maxWidth = pageWidth - margin * 2;
    
    const lines = text.split('\n');
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    for (const line of lines) {
      if (y < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      // Extremely basic text wrapping could be added here
      // For now we just draw the line
      page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0,0,0) });
      y -= fontSize * 1.5;
    }
    return await pdfDoc.save();
  }

  // 5. Word (.docx) via mammoth -> HTML -> Canvas -> PDF
  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return await htmlToPdfBytes(result.value, name);
  }

  // 6. Excel (.xlsx, .xls) via xlsx -> HTML -> Canvas -> PDF
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const html = xlsx.utils.sheet_to_html(worksheet);
    return await htmlToPdfBytes(html, name);
  }

  // 7. HTML
  if (name.endsWith('.html') || name.endsWith('.htm')) {
    const html = await file.text();
    return await htmlToPdfBytes(html, name);
  }

  throw new Error(`Unsupported file type: ${type} (${name})`);
}

// Helper to convert HTML string to PDF
async function htmlToPdfBytes(html: string, title: string): Promise<Uint8Array> {
  // Create an off-screen container
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '800px'; // fixed width for rendering
  container.style.background = 'white';
  container.style.color = 'black';
  container.style.padding = '20px';
  container.style.fontFamily = 'sans-serif';
  container.innerHTML = `<h2>${title}</h2><div style="width: 100%; overflow: hidden;">${html}</div>`;
  
  document.body.appendChild(container);
  
  try {
    const canvas = await html2canvas(container, {
      scale: 2, // better quality
      useCORS: true,
      logging: false,
    });
    
    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    const jpegBytes = await fetch(jpegDataUrl).then(r => r.arrayBuffer());
    
    const pdfDoc = await PDFDocument.create();
    const pdfImage = await pdfDoc.embedJpg(jpegBytes);
    
    // Scale down image to fit PDF page (e.g. A4 width)
    const a4Width = 595.28;
    const scale = a4Width / pdfImage.width;
    const height = pdfImage.height * scale;
    
    const page = pdfDoc.addPage([a4Width, height]);
    page.drawImage(pdfImage, { x: 0, y: 0, width: a4Width, height: height });
    
    return await pdfDoc.save();
  } finally {
    document.body.removeChild(container);
  }
}
