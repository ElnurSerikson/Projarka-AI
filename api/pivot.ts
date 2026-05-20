import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Analysis, PivotResult } from '../src/types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `Ты — циничный, но точный разборщик бизнес-идей по Jobs-to-be-Done.
Тебе дают идею и её текущую оценку. Предложи КОНКРЕТНЫЕ способы докрутить идею до 5.0:
усилить слабую силу (push/pull/inertia), сузить до горящего сегмента, сменить покупателя/ЛПР,
урезать до одного ценного действия и т.п. Каждый вариант — практичный и применимый завтра.

Стиль: жёстко, по делу. ЯЗЫК: пиши СТРОГО на русском — никаких иностранных слов, латиницы (кроме терминов Push, Pull, Inertia, CRM, MVP, B2B), иероглифов или случайных символов. Сомневаешься в слове — бери простой русский синоним.

Верни ТОЛЬКО валидный JSON (json) без markdown-обёртки, строго по схеме:
{ "variants": [ { "title": "краткий заголовок приёма", "text": "1-2 предложения: как именно докрутить" } ] }
Ровно 3 варианта.`

function str(v: unknown, fallback = ''): string {
  const s = typeof v === 'string' && v.trim() ? v.trim() : fallback
  return s.replace(/\*\*/g, '')
}

function assemblePivot(raw: any): PivotResult {
  const variants = Array.isArray(raw?.variants)
    ? raw.variants
        .map((v: any) => ({ title: str(v?.title), text: str(v?.text) }))
        .filter((v: { title: string; text: string }) => v.title && v.text)
        .slice(0, 3)
    : []

  while (variants.length < 1) {
    variants.push({
      title: 'Сузить до горящего сегмента',
      text: 'Найди нишу, где проблему терпят ежедневно и она стоит денег — узкий сегмент купит быстрее.',
    })
  }

  return { targetScore: 5.0, variants }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured' })
  }

  const idea = (req.body?.idea ?? '').toString().trim()
  const analysis = req.body?.analysis as Analysis | undefined
  if (!idea) {
    return res.status(400).json({ error: 'idea is required' })
  }

  const scoreLine = analysis
    ? `Текущая оценка: ${analysis.score}/5. Силы: ${analysis.forces
        .map((f) => `${f.label} ${f.score}/5`)
        .join(', ')}.`
    : ''

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.5,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Идея: «${idea}». ${scoreLine}` },
        ],
      }),
    })

    if (!groqRes.ok) {
      const detail = await groqRes.text()
      return res.status(502).json({ error: 'LLM request failed', detail: detail.slice(0, 500) })
    }

    const data = await groqRes.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return res.status(502).json({ error: 'Empty LLM response' })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return res.status(502).json({ error: 'LLM returned non-JSON' })
    }

    return res.status(200).json(assemblePivot(parsed))
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', detail: String(e).slice(0, 300) })
  }
}
