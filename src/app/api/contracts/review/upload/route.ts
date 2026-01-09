import { NextRequest, NextResponse } from 'next/server';

const ASPOSE_CLIENT_ID = process.env.ASPOSE_CLIENT_ID;
const ASPOSE_CLIENT_SECRET = process.env.ASPOSE_CLIENT_SECRET;

// Cache token with expiry
let cachedToken: { token: string; expires: number } | null = null;

/**
 * Get OAuth token from Aspose Cloud
 */
async function getAsposeToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 300000) {
    return cachedToken.token;
  }

  if (!ASPOSE_CLIENT_ID || !ASPOSE_CLIENT_SECRET) {
    throw new Error('Aspose Cloud credentials not configured.');
  }

  const response = await fetch('https://api.aspose.cloud/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${ASPOSE_CLIENT_ID}&client_secret=${ASPOSE_CLIENT_SECRET}`,
  });

  if (!response.ok) {
    throw new Error('Failed to authenticate with Aspose Cloud');
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return data.access_token;
}

/**
 * Extract text from DOCX using Aspose - converts to TXT which renders auto-numbering
 *
 * The key insight: Word documents often use auto-numbering (<w:numPr>) which stores
 * the list structure, not the actual "1.", "1.1" text. When we extract just text,
 * we lose the numbering. Converting to TXT format renders the numbering as text.
 */
async function extractDocxTextWithAspose(buffer: Buffer): Promise<string> {
  const token = await getAsposeToken();
  const filename = `extract-${Date.now()}.docx`;

  // Upload to Aspose storage
  const uploadResponse = await fetch(
    `https://api.aspose.cloud/v4.0/words/storage/file/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => 'Unknown error');
    console.error(`Aspose upload failed (${uploadResponse.status}): ${errorText}`);
    throw new Error(`Failed to upload document: ${uploadResponse.status}`);
  }

  console.log('Aspose upload successful, converting to TXT...');

  // Convert to TXT format - this RENDERS auto-numbering as actual text
  // The /text endpoint just extracts raw text nodes without list formatting
  // Converting to TXT renders the document as if printed, including numbers
  const convertResponse = await fetch(
    `https://api.aspose.cloud/v4.0/words/${encodeURIComponent(filename)}?format=txt`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );

  if (!convertResponse.ok) {
    // Fallback to /text endpoint if conversion fails
    console.log('TXT conversion failed, falling back to /text endpoint...');
    const textResponse = await fetch(
      `https://api.aspose.cloud/v4.0/words/${encodeURIComponent(filename)}/text`,
      {
        headers: { 'Authorization': `Bearer ${token}` },
      }
    );

    if (!textResponse.ok) {
      throw new Error('Failed to extract text');
    }

    const result = await textResponse.json();

    // Cleanup
    await cleanupAsposeFile(token, filename);

    return result.Text || '';
  }

  // TXT conversion returns the file content directly
  const textContent = await convertResponse.text();

  // Cleanup - delete from storage
  await cleanupAsposeFile(token, filename);

  return textContent;
}

/**
 * Helper to clean up uploaded files from Aspose storage
 */
async function cleanupAsposeFile(token: string, filename: string): Promise<void> {
  await fetch(
    `https://api.aspose.cloud/v4.0/words/storage/file/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  ).catch(() => {}); // Ignore cleanup errors
}

/**
 * Extract text from DOCX with auto-numbering rendered as text.
 * Parses OOXML directly to capture list numbering that mammoth misses.
 */
async function extractDocxWithNumbering(buffer: Buffer): Promise<string> {
  const JSZip = require('jszip');

  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  const numberingXml = await zip.file('word/numbering.xml')?.async('string');

  if (!docXml) {
    throw new Error('Invalid DOCX: missing document.xml');
  }

  // Parse numbering definitions
  const numberingDefs = parseNumberingXml(numberingXml || '');

  // Track current number for each list level
  const listCounters: Record<string, Record<number, number>> = {};

  // Extract paragraphs with numbering
  const paragraphs: string[] = [];
  const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
  let pMatch;

  while ((pMatch = pRegex.exec(docXml)) !== null) {
    const pContent = pMatch[1];

    // Extract ONLY text from <w:t> elements, ignoring all other XML
    const textParts: string[] = [];
    const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      textParts.push(decodeXmlEntities(tMatch[1]));
    }

    // Also handle <w:tab/> as space
    const text = textParts.join('').replace(/\s+/g, ' ').trim();

    // Check for numbering reference
    const numPrMatch = pContent.match(/<w:numPr>[\s\S]*?<w:ilvl[^>]*w:val="(\d+)"[\s\S]*?<w:numId[^>]*w:val="(\d+)"/);
    if (numPrMatch) {
      const ilvl = parseInt(numPrMatch[1], 10);
      const numId = numPrMatch[2];

      // Get numbering format
      const numDef = numberingDefs[numId];
      if (numDef && numDef[ilvl]) {
        const { format, text: numText } = numDef[ilvl];

        // Initialize counter for this numId if needed
        if (!listCounters[numId]) {
          listCounters[numId] = {};
        }
        if (listCounters[numId][ilvl] === undefined) {
          listCounters[numId][ilvl] = 0;
        }

        // Increment counter
        listCounters[numId][ilvl]++;

        // Reset lower levels
        for (let i = ilvl + 1; i < 10; i++) {
          listCounters[numId][i] = 0;
        }

        // Format the number
        const number = formatListNumber(listCounters[numId][ilvl], format);

        // Replace %1, %2 etc. with actual numbers
        let prefix = numText;
        for (let i = 0; i <= ilvl; i++) {
          const levelNum = formatListNumber(listCounters[numId][i] || 1, numDef[i]?.format || 'decimal');
          prefix = prefix.replace(`%${i + 1}`, levelNum);
        }

        // Add space after number prefix if text follows directly
        if (text && !prefix.endsWith(' ') && !prefix.endsWith('\t')) {
          prefix = prefix + ' ';
        }

        paragraphs.push(prefix + text);
      } else {
        paragraphs.push(text);
      }
    } else {
      paragraphs.push(text);
    }
  }

  return paragraphs.filter(p => p.trim()).join('\n\n');
}

/**
 * Parse numbering.xml to extract list format definitions
 */
function parseNumberingXml(xml: string): Record<string, Record<number, { format: string; text: string }>> {
  const result: Record<string, Record<number, { format: string; text: string }>> = {};

  // Extract abstractNum definitions
  const abstractNums: Record<string, Record<number, { format: string; text: string }>> = {};
  const abstractRegex = /<w:abstractNum[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g;
  let abstractMatch;

  while ((abstractMatch = abstractRegex.exec(xml)) !== null) {
    const abstractId = abstractMatch[1];
    const content = abstractMatch[2];
    abstractNums[abstractId] = {};

    const lvlRegex = /<w:lvl[^>]*w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g;
    let lvlMatch;
    while ((lvlMatch = lvlRegex.exec(content)) !== null) {
      const ilvl = parseInt(lvlMatch[1], 10);
      const lvlContent = lvlMatch[2];

      const formatMatch = lvlContent.match(/<w:numFmt[^>]*w:val="([^"]+)"/);
      const textMatch = lvlContent.match(/<w:lvlText[^>]*w:val="([^"]*)"/);

      abstractNums[abstractId][ilvl] = {
        format: formatMatch ? formatMatch[1] : 'decimal',
        text: textMatch ? textMatch[1] : '%1.',
      };
    }
  }

  // Map num to abstractNum
  const numRegex = /<w:num[^>]*w:numId="(\d+)"[^>]*>[\s\S]*?<w:abstractNumId[^>]*w:val="(\d+)"/g;
  let numMatch;
  while ((numMatch = numRegex.exec(xml)) !== null) {
    const numId = numMatch[1];
    const abstractId = numMatch[2];
    if (abstractNums[abstractId]) {
      result[numId] = abstractNums[abstractId];
    }
  }

  return result;
}

/**
 * Format a number according to Word's numbering format
 */
function formatListNumber(n: number, format: string): string {
  switch (format) {
    case 'decimal':
      return n.toString();
    case 'lowerLetter':
      return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    case 'upperLetter':
      return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    case 'lowerRoman':
      return toRoman(n).toLowerCase();
    case 'upperRoman':
      return toRoman(n);
    default:
      return n.toString();
  }
}

/**
 * Convert number to Roman numerals
 */
function toRoman(n: number): string {
  const romanNumerals: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];

  let result = '';
  for (const [value, numeral] of romanNumerals) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result;
}

/**
 * Decode XML entities
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// OCR.space PRO API - Get FREE PRO key at https://ocr.space/ocrapi/freekey
// PRO tier: 5MB file limit, 25K requests/month
// Note: base64 encoding adds ~33% overhead, so max raw file is ~3.7MB
const OCR_SPACE_API_KEY = process.env.OCR_SPACE_API_KEY || '';
const MAX_OCR_FILE_SIZE = 3.7 * 1024 * 1024; // ~3.7MB raw = ~5MB base64

// Extract text from PDF - tries native extraction first, falls back to OCR.space for scanned docs
async function extractPdfText(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);

  // First try native text extraction (fast, works for PDFs with text layer)
  try {
    const { extractText } = await import('unpdf');
    const result = await extractText(uint8Array, { mergePages: true });

    const text = result.text?.trim() || '';
    console.log(`PDF native extraction: ${result.totalPages} pages, ${text.length} chars`);

    // If we got meaningful text (more than just whitespace/artifacts), return it
    if (text.length > 50) {
      return text;
    }
    console.log('Native extraction returned minimal text, trying OCR.space...');
  } catch (error) {
    console.log('Native PDF extraction failed, trying OCR.space...', error);
  }

  // Fall back to OCR.space for scanned documents (FREE with PRO key)
  return extractPdfWithOCRSpace(buffer);
}

// Use OCR.space PRO API for scanned PDFs (FREE - 5MB limit, 25K requests/month)
async function extractPdfWithOCRSpace(buffer: Buffer): Promise<string> {
  // Check if API key is configured
  if (!OCR_SPACE_API_KEY) {
    throw new Error('OCR not configured. Add OCR_SPACE_API_KEY to environment variables. Get a FREE PRO key at https://ocr.space/ocrapi/freekey');
  }

  // Check file size (PRO limit is 5MB)
  if (buffer.length > MAX_OCR_FILE_SIZE) {
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(`PDF is too large for OCR (${sizeMB}MB). Maximum size is 5MB. Try compressing the PDF or using a smaller file.`);
  }

  try {
    const base64Pdf = buffer.toString('base64');
    const fileSizeKB = Math.round(buffer.length / 1024);
    const base64SizeKB = Math.round(base64Pdf.length / 1024);
    console.log(`OCR.space PRO: Processing PDF (raw: ${fileSizeKB}KB, base64: ${base64SizeKB}KB)...`);
    console.log(`OCR.space API key configured: ${OCR_SPACE_API_KEY ? 'Yes (starts with ' + OCR_SPACE_API_KEY.substring(0, 4) + '...)' : 'NO'}`);

    // OCR.space accepts base64 PDF directly
    const formData = new URLSearchParams();
    formData.append('apikey', OCR_SPACE_API_KEY);
    formData.append('base64Image', `data:application/pdf;base64,${base64Pdf}`);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('filetype', 'PDF');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for documents

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`OCR.space API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.IsErroredOnProcessing) {
      const errorMsg = data.ErrorMessage?.[0] || 'OCR processing failed';
      console.error('OCR.space error response:', JSON.stringify(data, null, 2));
      // Provide helpful message for common errors
      if (errorMsg.toLowerCase().includes('size') || errorMsg.toLowerCase().includes('limit')) {
        throw new Error(`File too large for OCR. Raw: ${fileSizeKB}KB, Base64: ${base64SizeKB}KB. PRO limit is 5MB base64. Original error: ${errorMsg}`);
      }
      throw new Error(errorMsg);
    }

    // Combine text from all pages
    const extractedText = data.ParsedResults
      ?.map((result: { ParsedText?: string }) => result.ParsedText || '')
      .join('\n\n--- Page Break ---\n\n')
      .trim() || '';

    console.log(`OCR.space complete: ${extractedText.length} chars extracted`);

    if (!extractedText) {
      throw new Error('OCR could not extract text from the PDF. The document may be image-based with unreadable text.');
    }

    return extractedText;
  } catch (error) {
    console.error('OCR.space error:', error);
    throw new Error(`PDF OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const filename = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate PDF magic bytes
    if (filename.endsWith('.pdf')) {
      const pdfMagic = buffer.slice(0, 5).toString('ascii');
      if (pdfMagic !== '%PDF-') {
        return NextResponse.json(
          { error: 'Invalid PDF file. The file does not appear to be a valid PDF document.' },
          { status: 400 }
        );
      }
    }

    let extractedText = '';

    if (filename.endsWith('.txt')) {
      // Plain text file
      extractedText = buffer.toString('utf-8');
    } else if (filename.endsWith('.pdf')) {
      // PDF extraction
      try {
        extractedText = await extractPdfText(buffer);
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        const errorMessage = pdfError instanceof Error ? pdfError.message : 'Unknown error';
        return NextResponse.json(
          { error: `Failed to parse PDF: ${errorMessage}` },
          { status: 400 }
        );
      }
    } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
      // Word document extraction - use custom OOXML parser (preserves numbering)
      // Aspose disabled due to API limits - custom parser works well for most docs
      try {
        console.log('Extracting DOCX with custom numbering parser...');
        extractedText = await extractDocxWithNumbering(buffer);
      } catch (customError) {
        console.error('Custom parser failed:', customError);
        // Fallback to mammoth (loses numbering but at least gets text)
        try {
          console.log('Falling back to mammoth (numbering will be lost)...');
          const mammoth = require('mammoth');
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value;
        } catch (mammothError) {
          console.error('Mammoth fallback also failed:', mammothError);
          return NextResponse.json(
            { error: 'Failed to parse Word document. Please ensure it is a valid .docx file.' },
            { status: 400 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF, DOCX, DOC, or TXT files.' },
        { status: 400 }
      );
    }

    // Clean up extracted text
    extractedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!extractedText) {
      return NextResponse.json(
        { error: 'No text could be extracted from the document. The PDF may be scanned/image-based.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: extractedText,
      filename: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error) {
    console.error('File upload error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to process uploaded file: ${errorMessage}` },
      { status: 500 }
    );
  }
}
