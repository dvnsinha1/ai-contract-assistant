import PDFParse from 'pdf-parse/lib/pdf-parse.js';

export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const data = await PDFParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF document');
  }
} 