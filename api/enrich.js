// POST /api/enrich  { profile: { name, age, location, role, school, links, extra } }
// Uses the free-tier SearchAPI.io Google engine to pull a few public
// search snippets about the person, so the generator has real-world
// context to work with. Keeps the SEARCHAPI_API_KEY on the server —
// it is never sent to the browser.

async function runQuery(query, apiKey) {
  const url = new URL('https://www.searchapi.io/api/v1/search');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '6');
  url.searchParams.set('api_key', apiKey);

  const resp = await fetch(url.toString());
  if (!resp.ok) return [];
  const json = await resp.json();
  return (json.organic_results || []).slice(0, 5).map(r => ({
    title: r.title || '',
    snippet: r.snippet || '',
    link: r.link || ''
  }));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.SEARCHAPI_API_KEY;
  if (!apiKey) { res.status(200).json({ results: [] }); return; } // fail soft — generation still works without it

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const profile = (body && body.profile) || {};

  const nameLoc = [profile.name, profile.location, profile.role, profile.school].filter(Boolean).join(' ');
  const queries = [];
  if (profile.name) queries.push(nameLoc.trim());
  if (profile.links) queries.push(`${profile.name} ${profile.links}`.trim());

  try {
    const batches = await Promise.all(queries.slice(0, 2).map(q => runQuery(q, apiKey)));
    const results = batches.flat().slice(0, 8);
    res.status(200).json({ results });
  } catch (err) {
    // Never block portfolio generation because search failed.
    res.status(200).json({ results: [] });
  }
};
