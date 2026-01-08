import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, AlignmentType, convertInchesToTwip } from 'docx';

/**
 * POST - Generate a plain-text DOCX from the ORIGINAL extracted text.
 *
 * PURPOSE: Create a document with identical formatting to the REVISED version
 * so Word Compare only shows CONTENT changes, not formatting differences.
 *
 * WORKFLOW:
 * 1. User uploads original contract → text extracted
 * 2. AI generates modified text → REVISED.docx
 * 3. This endpoint generates ORIGINAL-PLAIN.docx from extracted text
 * 4. User compares both in Word → only content changes shown
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalText, filename } = body;

    if (!originalText) {
      return NextResponse.json({ error: 'originalText is required' }, { status: 400 });
    }

    console.log('Generating original plain-text DOCX for Word Compare...');

    // DEBUG: Check for smart quotes in input
    const hasSmartQuotesBefore = /[\u201C\u201D\u2018\u2019]/.test(originalText);
    console.log(`[ORIGINAL-DOCX] Input has smart quotes: ${hasSmartQuotesBefore}`);
    console.log(`[ORIGINAL-DOCX] Sample input: ${originalText.substring(0, 150).replace(/\n/g, ' ')}`);

    // Normalize text to match Word's character encoding
    const normalizedText = normalizeForWord(originalText);

    // DEBUG: Check after normalization
    const hasSmartQuotesAfter = /[\u201C\u201D\u2018\u2019]/.test(normalizedText);
    console.log(`[ORIGINAL-DOCX] After normalize has smart quotes: ${hasSmartQuotesAfter}`);
    console.log(`[ORIGINAL-DOCX] Sample output: ${normalizedText.substring(0, 150).replace(/\n/g, ' ')}`);
    if (hasSmartQuotesBefore && !hasSmartQuotesAfter) {
      console.log('[ORIGINAL-DOCX] SUCCESS: Smart quotes removed!');
    } else if (hasSmartQuotesBefore && hasSmartQuotesAfter) {
      console.log('[ORIGINAL-DOCX] ERROR: Normalization failed to remove smart quotes!');
    }

    // Build document with IDENTICAL formatting to revised version
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: normalizedText.split('\n').map((line: string) => {
          // Detect section headers (all caps or numbered sections)
          const isHeader = /^[A-Z\s]{10,}$/.test(line.trim()) ||
                          /^(SECTION|ARTICLE|EXHIBIT)\s+\d+/i.test(line.trim()) ||
                          /^\d+\.\s+[A-Z]/.test(line.trim());

          return new Paragraph({
            children: [
              new TextRun({
                text: line,
                size: 24, // 12pt
                font: 'Times New Roman',
                bold: isHeader,
              }),
            ],
            alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
            spacing: {
              after: 200, // 10pt spacing after paragraphs
              line: 276, // 1.15 line spacing
            },
          });
        }),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const outputFilename = filename
      ? filename.replace(/\.docx$/i, '-ORIGINAL-PLAIN.docx')
      : 'contract-ORIGINAL-PLAIN.docx';

    console.log(`Generated ${outputFilename} (${buffer.length} bytes)`);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (error) {
    console.error('Generate original DOCX error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate document: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Normalize Unicode characters to ASCII equivalents for Word.
 *
 * CRITICAL: This MUST match the normalizeToASCII function in route.ts
 * and normalizeForWord in generate-docx/route.ts.
 *
 * Both ORIGINAL-PLAIN.docx and REVISED.docx must use identical encoding
 * to prevent Word Compare from showing spurious strike/reinsert changes.
 */
function normalizeForWord(text: string): string {
  return text
    // Smart double quotes → straight double quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    // Smart single quotes, apostrophes → straight single quote
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u2039\u203A]/g, "'")
    // En dash, em dash, horizontal bar, minus sign → hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    // Non-breaking space, various Unicode spaces → regular space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    // Ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Bullet point variants → asterisk
    .replace(/[\u2022\u2023\u2043]/g, '*')
    // Fraction characters → spelled out
    .replace(/\u00BD/g, '1/2')
    .replace(/\u00BC/g, '1/4')
    .replace(/\u00BE/g, '3/4');
}
