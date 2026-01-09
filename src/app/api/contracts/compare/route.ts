import { NextRequest, NextResponse } from 'next/server';
import DiffMatchPatch from 'diff-match-patch';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

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
 * AI prompt for intelligent contract comparison
 */
const CONTRACT_COMPARE_PROMPT = `You are an expert contract attorney comparing two versions of a legal agreement. Your task is to identify ALL meaningful differences between the ORIGINAL and REVISED versions.

ANALYSIS REQUIREMENTS:
1. Identify every substantive change (terms, amounts, dates, obligations, rights, liabilities)
2. Note structural changes (added/removed sections, reorganization)
3. Flag any changes that affect legal rights or obligations
4. Ignore minor formatting, whitespace, page numbers, and OCR artifacts

OUTPUT FORMAT (JSON only):
{
  "documentInfo": {
    "originalTitle": "Brief title/description of original document",
    "revisedTitle": "Brief title/description of revised document",
    "originalDate": "Date if found (e.g., '2024')",
    "revisedDate": "Date if found (e.g., '2026')"
  },
  "changes": [
    {
      "category": "TERM|PAYMENT|LIABILITY|INDEMNIFICATION|INSURANCE|TERMINATION|SCOPE|PARTIES|DATES|OTHER",
      "section": "Section name or number if applicable",
      "description": "Clear description of what changed",
      "originalText": "Relevant excerpt from original (keep brief)",
      "revisedText": "Relevant excerpt from revised (keep brief)",
      "significance": "high|medium|low",
      "impact": "Brief explanation of legal/business impact"
    }
  ],
  "summary": {
    "totalChanges": 0,
    "highSignificance": 0,
    "mediumSignificance": 0,
    "lowSignificance": 0,
    "keyTakeaways": [
      "Bullet point summary of most important changes"
    ]
  },
  "addedSections": ["List of new sections in revised"],
  "removedSections": ["List of sections removed from original"]
}

SIGNIFICANCE LEVELS:
- "high": Changes affecting liability, payment amounts >10%, term length, indemnification, IP rights
- "medium": Changes to notice periods, insurance amounts, procedural requirements
- "low": Administrative changes, contact info, minor clarifications

CRITICAL RULES:
- Return ONLY valid JSON, no explanations before or after
- Be thorough - identify ALL meaningful changes, not just the obvious ones
- Keep originalText and revisedText excerpts concise (1-3 sentences max)
- If documents are completely different contracts (not versions), note this in summary

===== ORIGINAL DOCUMENT =====
`;

/**
 * Use AI to intelligently compare two contract versions
 */
async function aiCompareContracts(originalText: string, revisedText: string): Promise<{
  documentInfo: {
    originalTitle: string;
    revisedTitle: string;
    originalDate: string;
    revisedDate: string;
  };
  changes: Array<{
    category: string;
    section: string;
    description: string;
    originalText: string;
    revisedText: string;
    significance: 'high' | 'medium' | 'low';
    impact: string;
  }>;
  summary: {
    totalChanges: number;
    highSignificance: number;
    mediumSignificance: number;
    lowSignificance: number;
    keyTakeaways: string[];
  };
  addedSections: string[];
  removedSections: string[];
}> {
  const fullPrompt = CONTRACT_COMPARE_PROMPT + originalText + '\n\n===== REVISED DOCUMENT =====\n' + revisedText;

  console.log('[AI COMPARE] Starting AI contract comparison...');
  const startTime = Date.now();

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mars-contracts.vercel.app',
      'X-Title': 'MARS Contract Compare',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [
        {
          role: 'user',
          content: fullPrompt,
        },
      ],
      max_tokens: 8000,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI COMPARE] OpenRouter error:', errorText);
    throw new Error(`AI comparison failed: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || '';

  console.log(`[AI COMPARE] Completed in ${(Date.now() - startTime) / 1000}s`);

  // Parse JSON response
  let jsonStr = content.trim();
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    return JSON.parse(jsonStr);
  }

  throw new Error('AI did not return valid JSON');
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
  mode?: 'ai' | 'diff';
  changes: CompareChange[];
  stats: CompareStats;
  sections: Array<{ section: string; changes: CompareChange[] }>;
  normalizedOriginal: string;
  normalizedRevised: string;
}

/**
 * POST - Compare two documents using AI-powered intelligent analysis.
 *
 * Default mode: AI comparison (useAI=true)
 * - Uses Claude to identify meaningful legal/business changes
 * - Filters out OCR noise, formatting differences
 * - Categorizes changes by significance
 *
 * Legacy mode: Character-level diff (useAI=false)
 * - Uses diff-match-patch for exact character comparison
 * - Good for comparing minor edits to same document
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalText, revisedText, useAI = true } = body;

    if (!originalText || !revisedText) {
      return NextResponse.json(
        { error: 'Both originalText and revisedText are required' },
        { status: 400 }
      );
    }

    console.log(`[COMPARE] Starting comparison (AI mode: ${useAI})...`);
    console.log(`[COMPARE] Original: ${originalText.length} chars, Revised: ${revisedText.length} chars`);

    // Normalize both texts
    const normalizedOriginal = normalizeToASCII(originalText);
    const normalizedRevised = normalizeToASCII(revisedText);

    // AI-powered comparison (default)
    if (useAI && OPENROUTER_API_KEY) {
      try {
        const aiResult = await aiCompareContracts(normalizedOriginal, normalizedRevised);

        console.log(`[COMPARE] AI found ${aiResult.changes.length} meaningful changes`);
        console.log(`[COMPARE] High: ${aiResult.summary.highSignificance}, Medium: ${aiResult.summary.mediumSignificance}, Low: ${aiResult.summary.lowSignificance}`);

        return NextResponse.json({
          mode: 'ai',
          ...aiResult,
          normalizedOriginal,
          normalizedRevised,
        });
      } catch (aiError) {
        console.error('[COMPARE] AI comparison failed, falling back to diff:', aiError);
        // Fall through to character-level diff
      }
    }

    // Fallback: Character-level diff using diff-match-patch
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(normalizedOriginal, normalizedRevised);
    dmp.diff_cleanupSemantic(diffs);

    const changes: CompareChange[] = diffs.map(([op, text], index) => ({
      id: index,
      type: op === 0 ? 'equal' : op === -1 ? 'delete' : 'insert',
      text,
    }));

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

    const sections = groupChangesBySection(normalizedOriginal, changes);

    console.log(`[COMPARE] Diff found ${stats.totalChanges} changes`);

    const result: CompareResult = {
      mode: 'diff',
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
