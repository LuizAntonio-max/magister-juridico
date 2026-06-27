// Vercel Serverless Function — /api/directdata.js
// Proxy para Direct Data API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { endpoint, ...params } = req.query;
  
  if (!endpoint) return res.status(400).json({ error: 'Endpoint obrigatório' });

  const qs = new URLSearchParams(params).toString();
  const url = `https://apiv3.directd.com.br/api/${endpoint}?${qs}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      }
    });

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(200).json(data);
    } else {
      const text = await response.text();
      return res.status(200).json({ resultado: text, status: response.status });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}
