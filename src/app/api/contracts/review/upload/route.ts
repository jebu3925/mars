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

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// Extract text from PDF - tries native extraction first, falls back to Vision OCR for scanned docs
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
    console.log('Native extraction returned minimal text, trying Vision OCR...');
  } catch (error) {
    console.log('Native PDF extraction failed, trying Vision OCR...', error);
  }

  // Fall back to Vision OCR for scanned documents
  return extractPdfWithVisionOCR(uint8Array);
}

// Use Claude to directly read PDF via Anthropic API (native PDF support)
async function extractPdfWithVisionOCR(uint8Array: Uint8Array): Promise<string> {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

  if (!ANTHROPIC_API_KEY && !OPENROUTER_API_KEY) {
    throw new Error('No API key configured for PDF OCR (need ANTHROPIC_API_KEY or OPENROUTER_API_KEY)');
  }

  try {
    const base64Pdf = Buffer.from(uint8Array).toString('base64');
    console.log(`Vision OCR: Sending PDF to Claude (${Math.round(base64Pdf.length / 1024)}KB)...`);

    let extractedText = '';

    // Try Anthropic API first (native PDF support)
    if (ANTHROPIC_API_KEY) {
      console.log('Using Anthropic API directly...');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64Pdf,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract ALL text from this PDF document verbatim. Include every page. Preserve formatting, paragraphs, and numbering. Output ONLY the raw text - no commentary, no descriptions, no "here is the text" preambles. Start directly with the document content.',
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        extractedText = data.content?.[0]?.text || '';
      } else {
        console.error('Anthropic API error:', await response.text());
      }
    }

    // Fallback to OpenRouter if Anthropic failed or unavailable
    if (!extractedText && OPENROUTER_API_KEY) {
      console.log('Using OpenRouter API...');
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mars-contracts.vercel.app',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  file: {
                    filename: 'document.pdf',
                    file_data: `data:application/pdf;base64,${base64Pdf}`,
                  },
                },
                {
                  type: 'text',
                  text: 'Extract ALL text from this PDF document verbatim. Include every page. Preserve formatting, paragraphs, and numbering. Output ONLY the raw text - no commentary, no descriptions, no preambles. Start directly with the document content.',
                },
              ],
            },
          ],
          max_tokens: 16000,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        extractedText = data.choices?.[0]?.message?.content || '';
      } else {
        console.error('OpenRouter API error:', await response.text());
      }
    }

    // Clean up any AI commentary that might have slipped through
    extractedText = cleanAICommentary(extractedText);

    console.log(`Vision OCR complete: ${extractedText.length} chars extracted`);

    if (!extractedText.trim()) {
      throw new Error('Could not extract text from the PDF');
    }

    return extractedText;
  } catch (error) {
    console.error('Vision OCR error:', error);
    throw new Error(`PDF OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Remove any AI commentary/preamble from extracted text
function cleanAICommentary(text: string): string {
  // Common AI preambles to remove
  const preamblePatterns = [
    /^I don't see any PDF[^]*?(?=\d|[A-Z]{2,})/i,
    /^I cannot see[^]*?(?=\d|[A-Z]{2,})/i,
    /^Here is the (?:extracted )?text[^]*?:\s*/i,
    /^The (?:document|PDF) (?:contains|reads)[^]*?:\s*/i,
    /^Once you provide[^]*?(?=\d|[A-Z]{2,})/i,
    /^To extract text[^]*?(?=\d|[A-Z]{2,})/i,
    /^(?:1\.|2\.)\s*(?:Upload|Share)[^]*?(?=\d+\s+of\s+\d+|[A-Z]{3,})/i,
  ];

  let cleaned = text;
  for (const pattern of preamblePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
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
