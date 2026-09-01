// POST /api/enrich  { profile: { name, age, location, role, school, links, extra } }
// Uses Tavily API (primary) to search for public information about the person,
// with SearchAPI.io as fallback. Provides the generator with real-world context.
// Keeps API keys on the server — they are never sent to the browser.

async function runTavilyQuery(query, apiKey) {
  const url = 'https://api.tavily.com/search';
  
  const payload = {
    api_key: apiKey,
    query: query,
    max_results: 5,
    include_answer: false
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) return [];
    
    const json = await resp.json();
    return (json.results || []).map(r => ({
      title: r.title || '',
      snippet: r.content || '',
      link: r.url || ''
    }));
  } catch (err) {
    return [];
  }
}

async function runSearchAPIQuery(query, apiKey) {
  const url = new URL('https://www.searchapi.io/api/v1/search');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '6');
  url.searchParams.set('api_key', apiKey);

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.organic_results || []).slice(0, 5).map(r => ({
      title: r.title || '',
      snippet: r.snippet || '',
      link: r.link || ''
    }));
  } catch (err) {
    return [];
  }
}

async function runQuery(query) {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const searchAPIKey = process.env.SEARCHAPI_API_KEY;

  // Try Tavily first
  if (tavilyKey) {
    const tavilyResults = await runTavilyQuery(query, tavilyKey);
    if (tavilyResults.length > 0) {
      return tavilyResults;
    }
  }

  // Fall back to SearchAPI.io if Tavily returns nothing
  if (searchAPIKey) {
    const searchResults = await runSearchAPIQuery(query, searchAPIKey);
    if (searchResults.length > 0) {
      return searchResults;
    }
  }

  return [];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const profile = (body && body.profile) || {};

  const nameLoc = [profile.name, profile.location, profile.role, profile.school].filter(Boolean).join(' ');
  const queries = [];
  if (profile.name) queries.push(nameLoc.trim());
  if (profile.links) queries.push(`${profile.name} ${profile.links}`.trim());

  try {
    const batches = await Promise.all(queries.slice(0, 2).map(q => runQuery(q)));
    const results = batches.flat().slice(0, 8);
    res.status(200).json({ results });
  } catch (err) {
    // Never block portfolio generation because search failed.
    res.status(200).json({ results: [] });
  }
};
