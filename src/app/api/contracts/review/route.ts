import { NextRequest, NextResponse } from 'next/server';
import DiffMatchPatch from 'diff-match-patch';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// OpenRouter model mapping
const MODEL_MAP: Record<string, string> = {
  haiku: 'anthropic/claude-3-haiku',
  sonnet: 'anthropic/claude-sonnet-4',
  opus: 'anthropic/claude-opus-4',
};

/**
 * Normalize Unicode characters to ASCII equivalents.
 *
 * CRITICAL: This prevents Word Compare from showing spurious strike/reinsert
 * when comparing documents with different quote/dash styles.
 *
 * Root cause: PDF extraction preserves smart quotes (U+201C/201D) but AI
 * outputs straight quotes (ASCII 0x22). Word sees these as different chars.
 */
function normalizeToASCII(text: string): string {
  return text
    // === QUOTES ===
    // Smart double quotes → straight double quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB]/g, '"')
    // Smart single quotes, apostrophes → straight single quote
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u2039\u203A]/g, "'")

    // === DASHES ===
    // En dash, em dash, horizontal bar, minus sign → hyphen
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')

    // === SPACES ===
    // Non-breaking space, various Unicode spaces → regular space
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')

    // === ELLIPSIS ===
    .replace(/\u2026/g, '...')

    // === OTHER COMMON SUBSTITUTIONS ===
    // Bullet point variants → asterisk (for consistency)
    .replace(/[\u2022\u2023\u2043]/g, '*')
    // Fraction characters → spelled out
    .replace(/\u00BD/g, '1/2')
    .replace(/\u00BC/g, '1/4')
    .replace(/\u00BE/g, '3/4');
}

// Alias for backwards compatibility with diff display
const normalizeText = normalizeToASCII;

/**
 * Generate a clean diff display showing ONLY the actual changes.
 * Uses diff-match-patch for accurate word-level comparison.
 *
 * Output format:
 * - Unchanged text: plain text
 * - Deleted text: [strikethrough]deleted words[/strikethrough]
 * - Inserted text: [underline]inserted words[/underline]
 */
function generateDiffDisplay(original: string, modified: string): string {
  const dmp = new DiffMatchPatch();

  // Normalize both texts to prevent spurious diffs from quote/dash styles
  const normalizedOriginal = normalizeText(original);
  const normalizedModified = normalizeText(modified);

  // Get character-level diff on NORMALIZED text
  const diffs = dmp.diff_main(normalizedOriginal, normalizedModified);

  // Clean up the diff for better readability
  dmp.diff_cleanupSemantic(diffs);

  // Build result string
  const result: string[] = [];

  for (const [operation, text] of diffs) {
    if (operation === 0) {
      // EQUAL - unchanged text
      result.push(text);
    } else if (operation === -1) {
      // DELETE - text removed from original
      // Skip if it's just whitespace changes
      if (text.trim()) {
        result.push(`[strikethrough]${text}[/strikethrough]`);
      } else {
        result.push(text); // Keep whitespace as-is
      }
    } else if (operation === 1) {
      // INSERT - text added in modified
      // Skip if it's just whitespace changes
      if (text.trim()) {
        result.push(`[underline]${text}[/underline]`);
      } else {
        result.push(text); // Keep whitespace as-is
      }
    }
  }

  return result.join('');
}

const MARS_CONTRACT_PROMPT = `You are an expert contract attorney reviewing agreements for MARS Company (the Contractor/Vendor). Your goal is to identify material risks and propose specific redlines.

MARS STANDARD NEGOTIATING POSITIONS:
- Liability: Cap at contract value, limit to direct damages only, exclude consequential/indirect damages
- Indemnification: Must be mutual and proportionate to fault; never indemnify for County/Client's own negligence
- IP/Work Product: MARS retains all pre-existing IP, tools, methodologies, templates; only deliverables specifically created become client property
- Termination: Require payment for work performed plus reasonable wind-down costs if terminated without cause
- Warranty: Should not exceed 1 year
- Payment: Net 30 or longer
- Audit Rights: Reasonable notice, limited frequency (annually), scope limited to records related to the agreement
- Disputes: Preserve right to legal remedies, no unilateral final decisions by client

YOUR TASK:
1. Identify ONLY sections with MATERIAL risks to MARS (skip boilerplate that's not negotiable)
2. For each material section, provide the ORIGINAL text and your REVISED text
3. In the "revisedText" field ONLY: Use **bold** for NEW language and ~~strikethrough~~ for removed text
4. Briefly explain WHY each change protects MARS

OUTPUT FORMAT:
{
  "sections": [
    {
      "sectionNumber": "6",
      "sectionTitle": "Indemnification",
      "materiality": "high",
      "originalText": "The exact original text from the contract...",
      "revisedText": "The revised text with **new language in bold** and ~~removed text struck through~~...",
      "rationale": "One sentence explaining why this change protects MARS"
    }
  ],
  "summary": [
    "Made indemnity proportionate to Contractor fault",
    "Added pre-existing IP carve-out",
    "Capped liability at contract value"
  ],
  "modifiedText": "The COMPLETE contract with all revisions applied - CLEAN TEXT ONLY, NO markdown formatting (no ** or ~~)"
}

MATERIALITY LEVELS:
- "high" = Must negotiate or walk away (unlimited liability, one-sided indemnity, IP ownership)
- "medium" = Should negotiate (audit scope, termination notice, dispute resolution)
- "low" = Nice to have but not dealbreaker

CRITICAL RULES:
- Only flag sections that are MATERIALLY unfavorable - skip standard government boilerplate
- Keep original text intact except for specific surgical changes
- The "modifiedText" field must contain the COMPLETE contract with changes applied
- CRITICAL: "modifiedText" must be PLAIN TEXT with NO markdown. Do NOT include ** or ~~ in modifiedText. Only the "revisedText" field in sections uses markdown.
- PRESERVE ALL SPECIAL CHARACTERS exactly as they appear: § (section symbol), ¶ (paragraph symbol), © ® ™, and all legal citation formats like "§16-203" or "§7-401"

IMPORTANT: Your response must be ONLY a JSON object. No explanations, no markdown, no text before or after. Start your response with { and end with }

CONTRACT:
`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, contractId, provisionName, model = 'sonnet' } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Contract text is required' },
        { status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    // CRITICAL: Normalize text BEFORE sending to AI
    // This ensures AI works with ASCII quotes/dashes, preventing mismatch
    // between original (smart quotes from PDF) and revised (AI output)
    const normalizedInput = normalizeToASCII(text);

    // DEBUG: Log normalization effect
    const hasSmartQuotes = /[\u201C\u201D\u2018\u2019]/.test(text);
    const hasSmartQuotesAfter = /[\u201C\u201D\u2018\u2019]/.test(normalizedInput);
    console.log(`[NORMALIZATION] Input had smart quotes: ${hasSmartQuotes}, After normalization: ${hasSmartQuotesAfter}`);

    const fullPrompt = MARS_CONTRACT_PROMPT + normalizedInput;

    // Call OpenRouter API
    const openRouterModel = MODEL_MAP[model] || MODEL_MAP.sonnet;
    console.log(`Starting OpenRouter analysis with model: ${openRouterModel}...`);
    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mars-contracts.vercel.app',
        'X-Title': 'MARS Contract Review',
      },
      body: JSON.stringify({
        model: openRouterModel,
        messages: [
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
        max_tokens: 16000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error:', errorText);
      return NextResponse.json(
        { error: `AI analysis failed: ${response.status}` },
        { status: 500 }
      );
    }

    const aiResponse = await response.json();
    const stdout = aiResponse.choices?.[0]?.message?.content || '';

    console.log(`OpenRouter completed in ${(Date.now() - startTime) / 1000}s`);
    console.log('Raw output length:', stdout.length);

    // Parse the response
    let result;
    try {
      // Try to extract JSON from the response - find the outermost { }
      let jsonStr = stdout.trim();

      // Strip markdown code blocks if present
      jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

      // Find JSON object boundaries - look for the structure we expect
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);

        // Try to parse
        try {
          result = JSON.parse(jsonStr);
        } catch {
          // If direct parse fails, try to fix common issues
          // Sometimes there are unescaped newlines in strings
          jsonStr = jsonStr.replace(/[\r\n]+/g, '\\n');
          result = JSON.parse(jsonStr);
        }

        console.log('Successfully parsed JSON response');
        console.log('Fields in result:', Object.keys(result));
        console.log('modifiedText length:', result.modifiedText?.length || 0);
        console.log('summary count:', result.summary?.length || 0);
      } else {
        // No JSON found - maybe the AI returned text. Try to extract any useful info
        console.log('No JSON braces found. Raw output:', stdout.substring(0, 1000));
        throw new Error('No JSON object found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.log('Raw output preview:', stdout.substring(0, 500));

      // If JSON parsing fails, return error with more context
      return NextResponse.json(
        { error: 'AI did not return valid JSON. Try selecting "Quick" mode or try again.' },
        { status: 500 }
      );
    }

    // Ensure summary is an array
    if (!Array.isArray(result.summary)) {
      result.summary = [result.summary || 'No summary provided'];
    }

    // Ensure sections is an array
    const sections = Array.isArray(result.sections) ? result.sections : [];

    // Ensure modifiedText exists and clean it up
    let modifiedText = result.modifiedText || text;

    // Strip any markdown formatting (AI sometimes includes despite instructions)
    modifiedText = modifiedText
      .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold** markers
      .replace(/~~([^~]+)~~/g, '$1');     // Remove ~~strikethrough~~ markers

    // Apply normalization to modifiedText as well (AI might introduce variants)
    modifiedText = normalizeToASCII(modifiedText);

    // Generate diff display using diff-match-patch
    // Both normalizedInput and modifiedText are now in same encoding
    const redlinedText = generateDiffDisplay(normalizedInput, modifiedText);

    console.log(`Generated diff display, original: ${normalizedInput.length} chars, modified: ${modifiedText.length} chars`);
    console.log(`Found ${sections.length} material sections to review`);

    return NextResponse.json({
      redlinedText,
      originalText: normalizedInput,  // Normalized for ORIGINAL-PLAIN.docx
      modifiedText,                    // Normalized for REVISED.docx
      summary: result.summary,
      sections, // NEW: Structured section-by-section analysis
      contractId,
      provisionName,
    });
  } catch (error) {
    console.error('Contract review error:', error);

    // Log more details about the error
    const errorDetails = error instanceof Error ? error.message : String(error);
    console.error('Full error details:', errorDetails);

    return NextResponse.json(
      { error: 'Failed to analyze contract. Please try again.' },
      { status: 500 }
    );
  }
}
