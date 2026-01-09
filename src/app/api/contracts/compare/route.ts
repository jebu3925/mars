import { NextRequest, NextResponse } from 'next/server';
import DiffMatchPatch from 'diff-match-patch';

/**
 * Normalize Unicode characters to ASCII equivalents.
 *
 * CRITICAL: This must match normalizeToASCII in review/route.ts
 * to ensure consistent encoding across all document operations.
 */
function normalizeToASCII(text: string): string {
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

/**
 * Detect section headers in contract text.
 * Returns the section number/title if line is a section header, null otherwise.
 */
function detectSectionHeader(line: string): string | null {
  const trimmed = line.trim();

  // Pattern: "SECTION 1", "ARTICLE 2", "EXHIBIT A"
  const sectionMatch = trimmed.match(/^(SECTION|ARTICLE|EXHIBIT)\s+(\d+|[A-Z])/i);
  if (sectionMatch) return sectionMatch[0];

  // Pattern: "1. TITLE" or "1.1 Title" (numbered sections)
  const numberedMatch = trimmed.match(/^(\d+\.?\d*\.?)\s+[A-Z]/);
  if (numberedMatch) return trimmed.split(/\s{2,}/)[0];

  // All caps line that's reasonably short (likely a header)
  if (/^[A-Z\s]{10,60}$/.test(trimmed) && !trimmed.includes('  ')) {
    return trimmed;
  }

  return null;
}

// Note: CompareChange interface is defined below

/**
 * Group changes by contract section for easier navigation.
 */
function groupChangesBySection(
  originalText: string,
  changes: Array<{ id: number; type: 'equal' | 'delete' | 'insert'; text: string }>
): Array<{ section: string; changes: Array<{ id: number; type: 'equal' | 'delete' | 'insert'; text: string }> }> {
  const sections: Array<{ section: string; changes: Array<{ id: number; type: 'equal' | 'delete' | 'insert'; text: string }> }> = [];
  let currentSection = 'Document Start';
  let currentChanges: Array<{ id: number; type: 'equal' | 'delete' | 'insert'; text: string }> = [];

  // Reconstruct text with change tracking
  let position = 0;
  const originalLines = originalText.split('\n');
  let lineIndex = 0;

  for (const change of changes) {
    // Check if we're entering a new section based on position in original text
    if (change.type === 'equal' || change.type === 'delete') {
      const text = change.text;
      const lines = text.split('\n');

      for (const line of lines) {
        const header = detectSectionHeader(line);
        if (header && currentChanges.length > 0) {
          // Save current section if it has changes
          const changesInSection = currentChanges.filter(c => c.type !== 'equal');
          if (changesInSection.length > 0) {
            sections.push({ section: currentSection, changes: [...currentChanges] });
          }
          currentSection = header;
          currentChanges = [];
        }
      }
    }

    currentChanges.push(change);
  }

  // Don't forget the last section
  const changesInSection = currentChanges.filter(c => c.type !== 'equal');
  if (changesInSection.length > 0) {
    sections.push({ section: currentSection, changes: [...currentChanges] });
  }

  return sections;
}

export interface CompareChange {
  id: number;
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

export interface CompareStats {
  totalChanges: number;
  deletions: number;
  insertions: number;
  originalLength: number;
  revisedLength: number;
  characterChanges: number;
}

export interface CompareResult {
  changes: CompareChange[];
  stats: CompareStats;
  sections: Array<{ section: string; changes: CompareChange[] }>;
  normalizedOriginal: string;
  normalizedRevised: string;
}

/**
 * POST - Compare two documents using deterministic diff-match-patch algorithm.
 *
 * CRITICAL: This endpoint uses NO AI for difference detection.
 * The diff-match-patch library is mathematically deterministic:
 * - Same inputs ALWAYS produce same outputs
 * - CANNOT hallucinate or make assumptions
 * - Character-level accuracy
 *
 * AI is ONLY used optionally for categorizing changes AFTER detection.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalText, revisedText, categorize = false } = body;

    if (!originalText || !revisedText) {
      return NextResponse.json(
        { error: 'Both originalText and revisedText are required' },
        { status: 400 }
      );
    }

    console.log(`[COMPARE] Starting comparison...`);
    console.log(`[COMPARE] Original: ${originalText.length} chars, Revised: ${revisedText.length} chars`);

    // Normalize both texts identically to prevent encoding-based false positives
    const normalizedOriginal = normalizeToASCII(originalText);
    const normalizedRevised = normalizeToASCII(revisedText);

    // Debug: Check if normalization changed anything
    const originalChanged = originalText !== normalizedOriginal;
    const revisedChanged = revisedText !== normalizedRevised;
    console.log(`[COMPARE] Normalization applied - Original changed: ${originalChanged}, Revised changed: ${revisedChanged}`);

    // Use deterministic diff algorithm (Google's diff-match-patch)
    const dmp = new DiffMatchPatch();

    // Get character-level diff
    const diffs = dmp.diff_main(normalizedOriginal, normalizedRevised);

    // Clean up for better readability (merges adjacent edits)
    dmp.diff_cleanupSemantic(diffs);

    // Convert to structured output
    // diff-match-patch returns: [operation, text]
    // operation: 0 = equal, -1 = delete, 1 = insert
    const changes: CompareChange[] = diffs.map(([op, text], index) => ({
      id: index,
      type: op === 0 ? 'equal' : op === -1 ? 'delete' : 'insert',
      text,
    }));

    // Calculate statistics
    let characterChanges = 0;
    for (const change of changes) {
      if (change.type !== 'equal') {
        characterChanges += change.text.length;
      }
    }

    const stats: CompareStats = {
      totalChanges: changes.filter(c => c.type !== 'equal').length,
      deletions: changes.filter(c => c.type === 'delete').length,
      insertions: changes.filter(c => c.type === 'insert').length,
      originalLength: normalizedOriginal.length,
      revisedLength: normalizedRevised.length,
      characterChanges,
    };

    // Group changes by section for easier navigation
    const sections = groupChangesBySection(normalizedOriginal, changes);

    console.log(`[COMPARE] Found ${stats.totalChanges} changes (${stats.deletions} deletions, ${stats.insertions} insertions)`);
    console.log(`[COMPARE] Grouped into ${sections.length} sections`);

    const result: CompareResult = {
      changes,
      stats,
      sections,
      normalizedOriginal,
      normalizedRevised,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[COMPARE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Comparison failed: ${message}` },
      { status: 500 }
    );
  }
}
