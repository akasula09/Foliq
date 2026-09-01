// GET /api/config
// Returns the PUBLIC Supabase project URL + publishable key so the
// static pages never need to hardcode them. The publishable key is
// safe to expose to the browser (Row Level Security still protects
// every table) — it is the direct replacement for the old "anon" key.
module.exports = async (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(500).json({ error: 'Server is missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY env vars.' });
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({ supabaseUrl, supabaseKey });
};
