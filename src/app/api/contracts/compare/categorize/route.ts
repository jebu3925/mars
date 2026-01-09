import { NextRequest, NextResponse } from 'next/server';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

interface CompareChange {
  id: number;
  type: 'equal' | 'delete' | 'insert';
  text: string;
}

interface CategorizedChange extends CompareChange {
  category?: 'substantive' | 'formatting' | 'minor';
  explanation?: string;
}

/**
 * POST - Categorize comparison changes using AI
 *
 * IMPORTANT: This endpoint ONLY categorizes already-detected changes.
 * It does NOT detect changes - that is done deterministically by diff-match-patch.
 *
 * Categories:
 * - substantive: Material legal changes (different terms, amounts, obligations)
 * - formatting: Cosmetic changes (whitespace, capitalization, punctuation)
 * - minor: Small changes that may or may not be significant
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { changes } = body;

    if (!changes || !Array.isArray(changes)) {
      return NextResponse.json({ error: 'Changes array is required' }, { status: 400 });
    }

    // Filter to only non-equal changes for categorization
    const changesToCategorize = changes.filter((c: CompareChange) => c.type !== 'equal');

    if (changesToCategorize.length === 0) {
      return NextResponse.json({ categorizedChanges: changes });
    }

    console.log(`[CATEGORIZE] Categorizing ${changesToCategorize.length} changes...`);

    // For small numbers of changes, use AI to categorize
    if (changesToCategorize.length <= 50) {
      const categorized = await categorizeWithAI(changesToCategorize);

      // Merge back with equal changes
      const result = changes.map((change: CompareChange) => {
        if (change.type === 'equal') return change;
        const found = categorized.find((c: CategorizedChange) => c.id === change.id);
        return found || change;
      });

      return NextResponse.json({ categorizedChanges: result });
    }

    // For large numbers, use heuristics to avoid API costs
    const result = changes.map((change: CompareChange) => {
      if (change.type === 'equal') return change;
      return {
        ...change,
        category: categorizeByHeuristics(change),
      };
    });

    return NextResponse.json({ categorizedChanges: result });
  } catch (error) {
    console.error('[CATEGORIZE] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Categorization failed: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Use AI to categorize changes with explanations
 */
async function categorizeWithAI(changes: CompareChange[]): Promise<CategorizedChange[]> {
  if (!OPENROUTER_API_KEY) {
    console.log('[CATEGORIZE] No API key, using heuristics');
    return changes.map(c => ({ ...c, category: categorizeByHeuristics(c) }));
  }

  // Build prompt with changes
  const changesText = changes.map(c => {
    const typeLabel = c.type === 'delete' ? 'DELETED' : 'INSERTED';
    return `[${c.id}] ${typeLabel}: "${c.text.substring(0, 200)}${c.text.length > 200 ? '...' : ''}"`;
  }).join('\n');

  const prompt = `You are a legal contract analyst. Categorize each of the following document changes as:
- "substantive": Material changes that affect legal meaning (different terms, amounts, dates, obligations, rights, parties, conditions)
- "formatting": Cosmetic changes (whitespace, capitalization, punctuation, numbering style)
- "minor": Small changes that may or may not affect meaning (word choice, synonyms)

CHANGES:
${changesText}

Respond with ONLY a JSON array of objects, each with:
- "id": the change ID number
- "category": "substantive" | "formatting" | "minor"
- "explanation": brief 5-10 word explanation

Example: [{"id": 0, "category": "substantive", "explanation": "Changes payment deadline from 30 to 60 days"}]`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mars-contracts.vercel.app',
        'X-Title': 'MARS Contract Compare',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku', // Fast and cheap for categorization
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4000,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error('[CATEGORIZE] AI call failed:', response.status);
      return changes.map(c => ({ ...c, category: categorizeByHeuristics(c) }));
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[CATEGORIZE] No JSON in response');
      return changes.map(c => ({ ...c, category: categorizeByHeuristics(c) }));
    }

    const categorizations = JSON.parse(jsonMatch[0]);

    // Merge categorizations back into changes
    return changes.map(change => {
      const cat = categorizations.find((c: { id: number; category: string; explanation: string }) => c.id === change.id);
      if (cat) {
        return {
          ...change,
          category: cat.category as 'substantive' | 'formatting' | 'minor',
          explanation: cat.explanation,
        };
      }
      return { ...change, category: categorizeByHeuristics(change) };
    });
  } catch (error) {
    console.error('[CATEGORIZE] AI error:', error);
    return changes.map(c => ({ ...c, category: categorizeByHeuristics(c) }));
  }
}

/**
 * Categorize changes using simple heuristics (no AI)
 */
function categorizeByHeuristics(change: CompareChange): 'substantive' | 'formatting' | 'minor' {
  const text = change.text.toLowerCase().trim();

  // Formatting: only whitespace or punctuation changes
  if (/^[\s\r\n]+$/.test(change.text)) return 'formatting';
  if (/^[.,;:'"()\[\]{}]+$/.test(change.text)) return 'formatting';

  // Substantive: contains numbers, dates, legal terms
  if (/\$[\d,]+/.test(change.text)) return 'substantive'; // Money
  if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(change.text)) return 'substantive'; // Dates
  if (/\d+\s*(days?|months?|years?|percent|%)/.test(text)) return 'substantive'; // Time periods
  if (/shall|must|will|agree|consent|terminate|indemnify|warrant|liable/.test(text)) return 'substantive';

  // Minor: short text, single words
  if (change.text.length < 5) return 'minor';

  // Default: if significant length, likely substantive
  if (change.text.length > 20) return 'substantive';

  return 'minor';
}
