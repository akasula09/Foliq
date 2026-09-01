// POST /api/generate  { profile: {...}, searchResults: [{title,snippet,link}] }
// Calls Gemini 3.7 Flash with a strict responseSchema so it returns
// ONLY clean JSON matching Foliq's template contract — the model
// never writes HTML/CSS/JS, just content + a theme + trigger hints.
// Uses thinking_level "medium" (Gemini 3.7 Flash's recommended default
// for balanced quality vs. latency/cost on this kind of writing task).

const THEMES = ['midnight', 'sunset', 'forest', 'mono', 'ocean', 'terminal'];
const SECTION_TYPES = ['experience', 'education', 'projects', 'skills', 'contact', 'custom'];

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    theme: { type: 'string', enum: THEMES, description: 'Pick the theme whose personality best fits this person.' },
    hero: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        tagline: { type: 'string', description: 'One punchy line, under 10 words, capturing who they are.' },
        subtitle: { type: 'string', description: 'One supporting sentence, optional.' }
      },
      required: ['name', 'tagline']
    },
    about: {
      type: 'object',
      properties: {
        heading: { type: 'string' },
        text: { type: 'string', description: '2-4 sentence bio written in third person, specific and warm, no filler.' }
      },
      required: ['text']
    },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'short kebab-case id, unique within the array' },
          type: { type: 'string', enum: SECTION_TYPES },
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                subheading: { type: 'string' },
                period: { type: 'string', description: 'e.g. "2022 — Present", only for experience/education' },
                description: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
                label: { type: 'string', description: 'only for contact items, e.g. "Email"' },
                value: { type: 'string', description: 'only for contact items, e.g. "you@example.com"' },
                link: { type: 'string', description: 'only for contact items, a full URL or mailto: link' }
              }
            }
          }
        },
        required: ['type', 'title', 'items']
      }
    }
  },
  required: ['theme', 'hero', 'about', 'sections']
};

function buildPrompt(profile, searchResults) {
  const facts = [
    `Name: ${profile.name}`,
    profile.age ? `Age: ${profile.age}` : null,
    profile.location ? `Location: ${profile.location}` : null,
    profile.role ? `Current role/title: ${profile.role}` : null,
    profile.school ? `School: ${profile.school}` : null,
    profile.links ? `Links they shared: ${profile.links}` : null,
    profile.extra ? `In their own words: ${profile.extra}` : null
  ].filter(Boolean).join('\n');

  const research = (searchResults || []).length
    ? (searchResults || []).map(r => `- ${r.title}: ${r.snippet} (${r.link})`).join('\n')
    : '(no public search results found — rely only on what they told you)';

  return `You are writing the content for a personal portfolio website.

PERSON'S OWN INPUT:
${facts}

PUBLIC SEARCH RESULTS ABOUT THIS PERSON (may be noisy or partly irrelevant — use only what plausibly matches them, ignore anything that looks like a different person):
${research}

Write a complete portfolio using ONLY information from the two sources above. Do not invent employers, schools, or achievements that were not mentioned or clearly supported by the search results. If information for a section is thin, either omit that section or keep it brief and general — never fabricate specifics like dates, company names, or metrics.

Guidelines:
- Choose sections that make sense for this person (e.g. skip "education" if nothing suggests they're a student and nothing was found; skip "experience" if there's truly nothing to say). Always include a "contact" section only if you have at least one real contact detail (from their links) — otherwise omit it.
- Keep section item counts reasonable: 2-6 items per section.
- Write in a natural, confident, specific voice — never generic corporate filler like "results-driven professional".
- Pick the theme that best matches their personality/field based on all the context.
- Return ONLY the JSON described by the schema.`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Server is missing GEMINI_API_KEY.' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const profile = (body && body.profile) || {};
  const searchResults = (body && body.searchResults) || [];

  if (!profile.name || !profile.age) {
    res.status(400).json({ error: 'Name and age are required.' });
    return;
  }

  const prompt = buildPrompt(profile, searchResults);

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel: 'medium' }
          }
        })
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      res.status(502).json({ error: 'Gemini request failed: ' + errText.slice(0, 300) });
      return;
    }

    const json = await resp.json();
    const text = json.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    let portfolio;
    try { portfolio = JSON.parse(text); }
    catch (e) { res.status(502).json({ error: 'Gemini returned invalid JSON.' }); return; }

    // Guard rails / defaults
    if (!THEMES.includes(portfolio.theme)) portfolio.theme = 'midnight';
    portfolio.sections = (portfolio.sections || []).map((s, i) => ({
      id: s.id || `${s.type || 'section'}-${i}`,
      type: SECTION_TYPES.includes(s.type) ? s.type : 'custom',
      title: s.title || 'Section',
      items: Array.isArray(s.items) ? s.items : []
    }));

    res.status(200).json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Generation failed.' });
  }
};
