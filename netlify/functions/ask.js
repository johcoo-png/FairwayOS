// FairwayOS — server-side Claude proxy.
// Keeps the Anthropic API key private (it lives in a Netlify environment
// variable, never in the public HTML). Uses raw fetch with no SDK dependency
// so it works on a zero-build static site — nothing to npm-install.
//
// To switch models, change MODEL below:
//   'claude-opus-4-8'  — most capable (default)
//   'claude-haiku-4-5' — ~5x cheaper, faster, slightly less capable
const MODEL = 'claude-opus-4-8';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return resp(405, { error: 'Method not allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return resp(503, { error: 'AI is not configured on the server yet.' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return resp(400, { error: 'Bad request body' }); }

  const question = String(body.question || '').slice(0, 1000).trim();
  const context  = String(body.context  || '').slice(0, 12000);
  if (!question) return resp(400, { error: 'Empty question' });

  const system =
    'You are the FairwayOS turf-management assistant for a golf course superintendent. ' +
    'Answer using ONLY the course data provided in the user message (moisture readings, scouting, ' +
    'sprays, green speeds, mow heights). If the data does not contain the answer, say so plainly. ' +
    'Be concise and practical — a few sentences, plain text, no markdown headings. ' +
    'Moisture guidance: a spot below 19% is urgent (hand-water now); below 23% needs attention. ' +
    'Respond only with your final answer — do not include your reasoning.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [
          { role: 'user', content: `Course data (JSON):\n${context}\n\nQuestion: ${question}` },
        ],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return resp(502, { error: 'AI provider error', detail: detail.slice(0, 500) });
    }

    const data = await r.json();
    const answer = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return resp(200, { answer: answer || 'No answer returned.' });
  } catch (e) {
    return resp(502, { error: 'AI request failed', detail: String((e && e.message) || e) });
  }
};

function resp(statusCode, obj) {
  return { statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) };
}
