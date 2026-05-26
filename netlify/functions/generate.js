const Anthropic = require('@anthropic-ai/sdk');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let carePrompt, recsPrompt, token;
  try {
    ({ carePrompt, recsPrompt, token } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // Verify session token before doing anything else
  const sitePassword = process.env.SITE_PASSWORD;
  if (!sitePassword || token !== sitePassword) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  if (!carePrompt || !recsPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing carePrompt or recsPrompt' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY environment variable is not configured on Netlify.' })
    };
  }

  const client = new Anthropic({ apiKey });

  try {
    // Run both AI calls in parallel for speed
    const [careMsg, recsMsg] = await Promise.all([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: carePrompt }]
      }),
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: recsPrompt }]
      })
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        careResult: careMsg.content[0].text,
        recsResult: recsMsg.content[0].text
      })
    };
  } catch (err) {
    console.error('Anthropic API error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI generation failed: ' + (err.message || err) })
    };
  }
};
