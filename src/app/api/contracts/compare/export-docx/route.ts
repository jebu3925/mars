import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';

interface CompareChange {
  id: number;
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

/**
 * POST - Export comparison results to a Word document with track changes style
 *
 * Creates a document showing:
 * 1. Header with file names
 * 2. Statistics summary
 * 3. Inline diff with deletions struck through and insertions underlined
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changes, originalFilename, revisedFilename } = body;

    if (!changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Changes array is required' }, { status: 400 });
    }

    console.log(`[EXPORT-DOCX] Generating comparison document with ${changes.length} change segments...`);

    // Calculate statistics
    const stats = {
      deletions: changes.filter((c: CompareChange) => c.type === 'delete').length,
      insertions: changes.filter((c: CompareChange) => c.type === 'insert').length,
      totalChanges: changes.filter((c: CompareChange) => c.type !== 'equal').length,
    };

    // Build document
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
        children: [
          // Title
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: 'Document Comparison Results',
                bold: true,
                size: 32,
                font: 'Arial',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          // File comparison info
          new Paragraph({
            children: [
              new TextRun({
                text: 'Original: ',
                bold: true,
                size: 22,
                font: 'Arial',
              }),
              new TextRun({
                text: originalFilename || 'Document A',
                size: 22,
                font: 'Arial',
              }),
            ],
            spacing: { after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Revised: ',
                bold: true,
                size: 22,
                font: 'Arial',
              }),
              new TextRun({
                text: revisedFilename || 'Document B',
                size: 22,
                font: 'Arial',
              }),
            ],
            spacing: { after: 300 },
          }),

          // Statistics table
          new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: 'Total Changes', bold: true, size: 20 })],
                      alignment: AlignmentType.CENTER,
                    })],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    shading: { fill: 'E5E7EB' },
                  }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: 'Deletions', bold: true, size: 20, color: 'DC2626' })],
                      alignment: AlignmentType.CENTER,
                    })],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    shading: { fill: 'FEE2E2' },
                  }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: 'Insertions', bold: true, size: 20, color: '16A34A' })],
                      alignment: AlignmentType.CENTER,
                    })],
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    shading: { fill: 'DCFCE7' },
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: stats.totalChanges.toString(), size: 24, bold: true })],
                      alignment: AlignmentType.CENTER,
                    })],
                  }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: stats.deletions.toString(), size: 24, bold: true, color: 'DC2626' })],
                      alignment: AlignmentType.CENTER,
                    })],
                  }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({ text: stats.insertions.toString(), size: 24, bold: true, color: '16A34A' })],
                      alignment: AlignmentType.CENTER,
                    })],
                  }),
                ],
              }),
            ],
          }),

          // Spacing
          new Paragraph({ spacing: { after: 400 } }),

          // Comparison results header
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: 'Detailed Comparison',
                bold: true,
                size: 26,
                font: 'Arial',
              }),
            ],
            spacing: { after: 200 },
          }),

          // Legend
          new Paragraph({
            children: [
              new TextRun({ text: 'Legend: ', bold: true, size: 20 }),
              new TextRun({ text: 'Deleted text', strike: true, color: 'DC2626', size: 20 }),
              new TextRun({ text: ' | ', size: 20 }),
              new TextRun({ text: 'Inserted text', underline: {}, color: '16A34A', size: 20 }),
            ],
            spacing: { after: 300 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            },
          }),

          // Comparison content - convert changes to paragraphs
          ...buildComparisonParagraphs(changes),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const timestamp = new Date().toISOString().slice(0, 10);
    const outputFilename = `comparison-${timestamp}.docx`;

    console.log(`[EXPORT-DOCX] Generated ${outputFilename} (${buffer.length} bytes)`);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${outputFilename}"`,
      },
    });
  } catch (error) {
    console.error('[EXPORT-DOCX] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate document: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Build paragraphs from comparison changes.
 * Groups changes by line/paragraph for better readability.
 */
function buildComparisonParagraphs(changes: CompareChange[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let currentRuns: TextRun[] = [];

  for (const change of changes) {
    // Split by newlines to handle paragraph breaks
    const parts = change.text.split('\n');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part.length > 0) {
        // Create text run based on change type
        let run: TextRun;

        if (change.type === 'delete') {
          run = new TextRun({
            text: part,
            strike: true,
            color: 'DC2626', // Red
            size: 22,
            font: 'Times New Roman',
          });
        } else if (change.type === 'insert') {
          run = new TextRun({
            text: part,
            underline: {},
            color: '16A34A', // Green
            size: 22,
            font: 'Times New Roman',
          });
        } else {
          run = new TextRun({
            text: part,
            size: 22,
            font: 'Times New Roman',
          });
        }

        currentRuns.push(run);
      }

      // If this isn't the last part, we have a newline - create paragraph
      if (i < parts.length - 1) {
        if (currentRuns.length > 0) {
          paragraphs.push(new Paragraph({
            children: currentRuns,
            spacing: { after: 120, line: 276 },
          }));
          currentRuns = [];
        } else {
          // Empty paragraph for blank line
          paragraphs.push(new Paragraph({
            spacing: { after: 120 },
          }));
        }
      }
    }
  }

  // Don't forget remaining runs
  if (currentRuns.length > 0) {
    paragraphs.push(new Paragraph({
      children: currentRuns,
      spacing: { after: 120, line: 276 },
    }));
  }

  return paragraphs;
}
