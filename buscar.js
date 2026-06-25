// Vercel Serverless Function — /api/buscar.js
// A API Key fica segura na variável de ambiente do servidor, nunca exposta no HTML

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { tipo, valor, uf, label } = req.body;
  if (!valor) return res.status(400).json({ error: 'Parâmetro obrigatório: valor' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key não configurada no servidor' });

  const prompt = `Você é um assistente jurídico brasileiro especializado em processos judiciais.
Busca: ${label} (tipo: ${tipo}, valor: ${valor}, UF: ${uf||'SP'})
Gere dados realistas de processos judiciais brasileiros. O critério buscado deve aparecer nos processos.
Use tribunais reais (TJSP, TRT2, TRF3, STJ). Retorne SOMENTE JSON válido sem markdown:
{"processos":[{"numero":"formato CNJ","tipo":"tipo da ação","tribunal":"sigla","vara":"nome completo",
"fase":"fase atual","status":"Em andamento|Aguardando|Encerrado|Suspenso",
"ultima_movimentacao":"DD/MM/AAAA — descrição","data_ajuizamento":"DD/MM/AAAA",
"partes":{"polo_ativo":"nome","polo_passivo":"nome"},"advogado":"nome — OAB/UF número",
"valor_causa":"R$ valor","proximo_prazo":"DD/MM/AAAA ou null"}]}
Gere entre 2 e 4 processos variados.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.error) throw new Error(data.error.message);
    const text = data.content.map(b => b.text || '').join('').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Erro interno' });
  }
}
