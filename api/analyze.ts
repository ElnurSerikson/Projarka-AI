import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Analysis, Force } from '../src/types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const FORCE_LABEL: Record<Force, string> = {
  push: 'Боль (Push)',
  pull: 'Магнит (Pull)',
  inertia: 'Лёгкость (Inertia)',
}

const OFFER_META: Record<Force, { title: string; subtitle: string }> = {
  push: { title: 'Агрессор', subtitle: 'Упор на Push' },
  pull: { title: 'Магнит', subtitle: 'Упор на Pull' },
  inertia: { title: 'Стелс', subtitle: 'Упор на Inertia' },
}

const SYSTEM_PROMPT = `Ты — циничный, но точный разборщик бизнес-идей по фреймворку Jobs-to-be-Done.
Оцениваешь три силы по шкале 1–5 (целые):
- push (Боль): насколько остра, часта и дорога проблема, толкающая искать решение.
- pull (Магнит): насколько желанен и осязаем результат после покупки.
- inertia (Лёгкость): насколько легко и безопасно начать (выше балл — ниже трение, страх и стоимость перехода).

Стиль: жёстко, по делу, без воды, на русском. Ключевые косяки/инсайты оборачивай в **двойные звёздочки**.

Верни ТОЛЬКО валидный JSON (json) без markdown-обёртки, строго по схеме:
{
  "scores": { "push": 1-5, "pull": 1-5, "inertia": 1-5 },
  "roast": {
    "push": "2-3 предложения разбора силы push с **жирными** косяками",
    "pull": "2-3 предложения про pull",
    "inertia": "2-3 предложения про inertia"
  },
  "verdict": "очень короткая хлёсткая фраза-приговор, напр. 'Это самоубийство.' или 'Взлётная полоса открыта.'",
  "offers": {
    "push": "оффер с упором на боль/срочность, 2-3 предложения, можно упомянуть саму идею",
    "pull": "оффер с упором на измеримый результат",
    "inertia": "оффер с упором на бесшовное внедрение"
  },
  "questions": ["вопрос потенциальному клиенту 1", "вопрос 2", "вопрос 3"]
}`

const FORCES: Force[] = ['push', 'pull', 'inertia']

function clampScore(v: unknown): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

// Собираем строгий Analysis из «сырого» ответа LLM — фиксированные ярлыки/тайтлы гарантируют инварианты UI.
function assembleAnalysis(raw: any): Analysis {
  const scores = raw?.scores ?? {}
  const roast = raw?.roast ?? {}
  const offers = raw?.offers ?? {}

  const forces = FORCES.map((force) => ({
    force,
    label: FORCE_LABEL[force],
    score: clampScore(scores[force]),
    text: str(roast[force], 'Разбор недоступен.'),
  }))

  const avg = forces.reduce((s, f) => s + f.score, 0) / forces.length
  const score = Math.min(5, Math.max(1, Math.round(avg * 10) / 10))

  const offerList = FORCES.map((force) => ({
    id: force,
    title: OFFER_META[force].title,
    subtitle: OFFER_META[force].subtitle,
    text: str(offers[force], 'Оффер недоступен.'),
  }))

  const questions = Array.isArray(raw?.questions)
    ? raw.questions.map((q: unknown) => str(q)).filter(Boolean).slice(0, 3)
    : []
  while (questions.length < 3) questions.push('Готовы ли клиенты платить за это уже сегодня?')

  return {
    score,
    verdict: str(raw?.verdict, 'Разбор завершён.'),
    forces,
    offers: offerList,
    questions,
  }
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
  if (!idea) {
    return res.status(400).json({ error: 'idea is required' })
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.85,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Идея для разбора: «${idea}»` },
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

    return res.status(200).json(assembleAnalysis(parsed))
  } catch (e) {
    return res.status(500).json({ error: 'Unexpected error', detail: String(e).slice(0, 300) })
  }
}
