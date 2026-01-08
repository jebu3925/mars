import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  NumberFormat,
  LevelFormat,
  AlignmentType as NumAlignment,
} from 'docx';

/**
 * POST - Generate a Revised DOCX for Word Compare
 *
 * APPROACH: Generate DOCX with structure matching the original contract:
 * - Numbered lists detected and created as proper Word numbered lists
 * - This ensures Word Compare shows only TEXT changes, not structural differences
 *
 * User workflow:
 * 1. Download this REVISED.docx
 * 2. Word → Review → Compare → Compare Documents
 * 3. Original: uploaded contract | Revised: this REVISED.docx
 * 4. Click "More ▾" → UNCHECK "Formatting"
 * 5. Save the combined document AS IS - that's the deliverable with track changes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { modifiedText, filename } = body;

    if (!modifiedText) {
      return NextResponse.json({ error: 'modifiedText is required' }, { status: 400 });
    }

    console.log('Generating revised DOCX for Word Compare...');

    // Normalize text to match Word's character encoding
    const normalizedText = normalizeForWord(modifiedText);

    // Parse lines and detect structure
    const lines = normalizedText.split('\n');
    const parsedLines = lines.map(parseLine);

    // Create numbering definitions for different list types
    const numbering = createNumberingConfig();

    // Build document with structure-aware paragraphs
    const doc = new Document({
      numbering,
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
        children: parsedLines.map((parsed, index) => createParagraph(parsed, index)),
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const outputFilename = filename
      ? filename.replace(/\.docx$/i, '-REVISED.docx')
      : 'contract-REVISED.docx';

    console.log(`Generated ${outputFilename} (${buffer.length} bytes)`);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (error) {
    console.error('Generate DOCX error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate document: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Parsed line with structure detection
 */
interface ParsedLine {
  text: string;
  originalText: string;
  type: 'header' | 'numbered' | 'lettered' | 'roman' | 'plain';
  level: number;
  numberValue?: string;
}

/**
 * Parse a line to detect its structure
 */
function parseLine(line: string): ParsedLine {
  const trimmed = line.trim();

  // Detect section headers (SECTION, ARTICLE, or all caps)
  if (/^(SECTION|ARTICLE|EXHIBIT)\s+\d+/i.test(trimmed) ||
      (/^[A-Z\s]{10,}$/.test(trimmed) && trimmed.length < 80)) {
    return { text: trimmed, originalText: line, type: 'header', level: 0 };
  }

  // Detect numbered patterns - keep the number in the text for now
  // Pattern: "1." or "1)" at start
  const numMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
  if (numMatch) {
    return {
      text: trimmed, // Keep full text including number
      originalText: line,
      type: 'numbered',
      level: 0,
      numberValue: numMatch[1],
    };
  }

  // Pattern: "(1)" at start
  const parenNumMatch = trimmed.match(/^\((\d+)\)\s+(.*)$/);
  if (parenNumMatch) {
    return {
      text: trimmed,
      originalText: line,
      type: 'numbered',
      level: 1,
      numberValue: parenNumMatch[1],
    };
  }

  // Pattern: "a." or "a)" at start (lettered)
  const letterMatch = trimmed.match(/^([a-z])[.)]\s+(.*)$/i);
  if (letterMatch) {
    return {
      text: trimmed,
      originalText: line,
      type: 'lettered',
      level: 1,
      numberValue: letterMatch[1],
    };
  }

  // Pattern: "(a)" at start
  const parenLetterMatch = trimmed.match(/^\(([a-z])\)\s+(.*)$/i);
  if (parenLetterMatch) {
    return {
      text: trimmed,
      originalText: line,
      type: 'lettered',
      level: 2,
      numberValue: parenLetterMatch[1],
    };
  }

  // Pattern: "(i)" "(ii)" "(iii)" roman numerals
  const romanMatch = trimmed.match(/^\(([ivxlcdm]+)\)\s+(.*)$/i);
  if (romanMatch) {
    return {
      text: trimmed,
      originalText: line,
      type: 'roman',
      level: 2,
      numberValue: romanMatch[1],
    };
  }

  // Plain paragraph
  return { text: trimmed, originalText: line, type: 'plain', level: 0 };
}

/**
 * Create numbering configuration for the document
 */
function createNumberingConfig() {
  return {
    config: [
      {
        reference: 'decimal-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: NumAlignment.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'letter-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.LOWER_LETTER,
            text: '(%1)',
            alignment: NumAlignment.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
          },
        ],
      },
      {
        reference: 'roman-list',
        levels: [
          {
            level: 0,
            format: LevelFormat.LOWER_ROMAN,
            text: '(%1)',
            alignment: NumAlignment.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
          },
        ],
      },
    ],
  };
}

/**
 * Create a paragraph from parsed line
 */
function createParagraph(parsed: ParsedLine, index: number): Paragraph {
  const isHeader = parsed.type === 'header';

  // For now, render all text as-is (including numbers) to ensure Word Compare works
  // The key is matching the structure visually, not using Word's auto-numbering
  // (Auto-numbering creates structural mismatch with original's literal numbers)

  return new Paragraph({
    children: [
      new TextRun({
        text: parsed.text,
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
    // Add indentation for nested items to match typical contract structure
    indent: parsed.level > 0 ? {
      left: parsed.level * 720, // 0.5 inch per level
    } : undefined,
  });
}

/**
 * Normalize Unicode characters to ASCII equivalents for Word.
 *
 * CRITICAL: This MUST match the normalizeToASCII function in route.ts
 * Both ORIGINAL-PLAIN.docx and REVISED.docx must use identical encoding
 * to prevent Word Compare from showing spurious strike/reinsert changes.
 *
 * Note: Legal symbols (§, ¶, ©, ®, ™) are preserved as they're standard.
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
