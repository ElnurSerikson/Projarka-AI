import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Analysis, Force } from '../src/types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const FORCE_LABEL: Record<Force, string> = {
  push: 'Боль (Push)',
  pull: 'Магнит (Pull)',
  inertia: 'Лёгкость (Inertia)',
  anxiety: 'Тревога (Anxiety)',
}

// Оферы только для 3 сил (без anxiety) — это позиционирование, а не разбор.
const OFFER_META: Record<'push' | 'pull' | 'inertia', { title: string; subtitle: string }> = {
  push: { title: 'Агрессор', subtitle: 'Упор на Push' },
  pull: { title: 'Магнит', subtitle: 'Упор на Pull' },
  inertia: { title: 'Стелс', subtitle: 'Упор на Inertia' },
}

const SYSTEM_PROMPT = `Ты — острый венчурный аналитик и злой, но честный ментор фаундеров. Разбираешь бизнес-идею по фреймворку Jobs-to-be-Done.
Оцениваешь четыре силы по шкале 1–5 (целые):
- push (Боль): насколько остра, часта и дорога проблема, толкающая искать решение.
- pull (Магнит): насколько желанен и осязаем результат после покупки.
- inertia (Лёгкость): насколько легко переключиться — низкое трение и слабая привычка к старому (выше балл = легче начать).
- anxiety (Тревога): насколько силён страх и неуверенность ПЕРЕД переходом (риск, недоверие, цена ошибки, «вдруг не сработает»). ВЫСОКИЙ балл = МНОГО тревоги, и это ПЛОХО для идеи.

КАЛИБРОВКА БАЛЛОВ — НЕ НАТЯГИВАЙ. По умолчанию ты скептик и не веришь идее на слово:
- 1 = провал по этой силе; 2 = слабо, серьёзная дыра; 3 = средне (норма по умолчанию); 4 = сильно, но требует доказательств; 5 = выдающе, большая редкость.
- Большинство идей в реальности — середнячок: типичный расклад это баллы 2–3, а не 4–5. Высокий балл надо ЗАСЛУЖИТЬ явными признаками, а не «звучит логично».
- Не предполагай, что боль острая — почти любую боль люди терпят годами. Не предполагай, что внедряться легко — люди ленивы, недоверчивы и не заходят даже в бесплатное. Сомневаешься — ставь НИЖЕ.
- Не бойся ставить 1 и 2. Идея без явных сильных сторон не должна получать «золото».

ТОН: безжалостно честный, как инвестор, видевший сотни таких идей. Дай голую суровую правду — вскрой реальные дыры, неудобные вопросы и иллюзии фаундера. Но честно в обе стороны: где сила РЕАЛЬНО есть — признай коротко и без подхалимажа; где слабо — бей прямо. Критики должно быть БОЛЬШЕ, чем похвалы. Не уничтожай ради уничтожения и не подслащивай — просто говори как есть.

КАК ПИСАТЬ РАЗБОР (roast) — это главный экран, выложись по полной:
1. КОНКРЕТНО про ЭТУ идею. Называй продукт и аудиторию, как человек решает задачу СЕЙЧАС (чем заменяет), конкретный сценарий, цифру или сравнение с альтернативой.
2. ЗАПРЕЩЕНЫ дежурные фразы, которые подойдут к любой идее («проблема знакома, но не критична», «результат желанен», «есть сомнения»). Если предложение можно дословно переставить в разбор другой идеи — перепиши его конкретнее.
3. Каждый абзац строй как аргумент: утверждение про эту идею → ПОЧЕМУ так → к чему это ведёт. Доказывай, а не констатируй.
4. Тон: жёстко, с характером и злой иронией, но строго по делу и без воды. 2–4 ёмких предложения на силу. Ключевой вывод оборачивай в **двойные звёздочки**.

Пример (идея «приложение, которое по фото холодильника предлагает рецепты»):
ПЛОХО (вода): «Боль есть, но не критична. Люди морщатся, но терпят.»
ХОРОШО (конкретно): «Боль слабая: люди и так за 10 секунд гуглят «что приготовить из того что есть» — **бесплатно и без установки**. Ты лезешь туда, где поиск уже всё закрыл, — за это не платят.»

ВАЖНО: в verdict, offers и questions звёздочек НЕ ставь — это чистый текст, его копируют как есть.
ЯЗЫК: пиши СТРОГО на русском. Никаких иностранных слов, латиницы (кроме устоявшихся терминов: Push, Pull, Inertia, CRM, BANT, MVP, B2B), иероглифов или случайных символов. Сомневаешься в слове — подбери простой русский синоним.

Верни ТОЛЬКО валидный JSON (json) без markdown-обёртки, строго по схеме:
{
  "scores": { "push": 1-5, "pull": 1-5, "inertia": 1-5, "anxiety": 1-5 },
  "roast": {
    "push": "конкретный разбор боли ПРО ЭТУ идею: насколько остра проблема, чем её решают сейчас, к чему это ведёт (2-4 предложения, с **выводами**)",
    "pull": "конкретно про притяжение этой идеи: какой результат, чем он лучше альтернативы, есть ли «вау»",
    "inertia": "конкретно про трение входа именно этой идеи: что придётся менять, почему останутся на старом",
    "anxiety": "конкретно про страх перед этой идеей: чего боятся, какова цена ошибки (высокий балл = много тревоги)"
  },
  "verdict": "ОДНА короткая, хлёсткая и честная фраза-приговор по сути, без воды и смягчений, напр. 'Это самоубийство.' / 'Боль выдумана.' / 'Сильно, беги проверять на клиентах.'",
  "offers": {
    "push": "оффер с упором на боль/срочность, 2-3 предложения, можно упомянуть саму идею",
    "pull": "оффер с упором на измеримый результат",
    "inertia": "оффер с упором на бесшовное внедрение"
  },
  "questions": ["кастдев-вопрос клиенту 1", "вопрос 2", "вопрос 3"]
}

questions — это 3 вопроса для КАСТДЕВА: фаундер задаёт их ПОТЕНЦИАЛЬНОМУ КЛИЕНТУ (не себе!), чтобы проверить, реальна ли боль и готовы ли за решение платить. Спрашивай про ПРОШЛЫЙ опыт и ТЕКУЩЕЕ поведение человека: как он решает проблему сейчас, сколько времени/денег теряет, что уже пробовал и почему бросил. НЕ задавай гипотетических («стали бы вы…»), стратегических вопросов и вопросов про развитие/маркетинг продукта — это вопросы себе, а не клиенту.
Хорошо: «Сколько часов в неделю вы сейчас тратите на X и во сколько это вам обходится?»
Плохо: «Как вы планируете привлекать пользователей?» (это вопрос фаундеру себе, а не клиенту).`

const ANALYSIS_FORCES: Force[] = ['push', 'pull', 'inertia', 'anxiety']
const OFFER_FORCES: Array<'push' | 'pull' | 'inertia'> = ['push', 'pull', 'inertia']

function clampScore(v: unknown): number {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, n))
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback
}

// Чистый текст без markdown-звёздочек — для оферов/вопросов/вердикта (их копируют как есть).
function plain(v: unknown, fallback = ''): string {
  return str(v, fallback).replace(/\*\*/g, '')
}

// Собираем строгий Analysis из «сырого» ответа LLM — фиксированные ярлыки/тайтлы гарантируют инварианты UI.
function assembleAnalysis(raw: any): Analysis {
  const scores = raw?.scores ?? {}
  const roast = raw?.roast ?? {}
  const offers = raw?.offers ?? {}

  const forces = ANALYSIS_FORCES.map((force) => ({
    force,
    label: FORCE_LABEL[force],
    score: clampScore(scores[force]),
    text: str(roast[force], 'Разбор недоступен.'),
  }))

  // Тревога — резистор: в агрегат идёт инверсией (6 − балл), чтобы высокая тревога снижала итог.
  const avg =
    forces.reduce((s, f) => s + (f.force === 'anxiety' ? 6 - f.score : f.score), 0) / forces.length
  const score = Math.min(5, Math.max(1, Math.round(avg * 10) / 10))

  const offerList = OFFER_FORCES.map((force) => ({
    id: force,
    title: OFFER_META[force].title,
    subtitle: OFFER_META[force].subtitle,
    text: plain(offers[force], 'Оффер недоступен.'),
  }))

  const questions = Array.isArray(raw?.questions)
    ? raw.questions.map((q: unknown) => plain(q)).filter(Boolean).slice(0, 3)
    : []
  while (questions.length < 3) questions.push('Готовы ли клиенты платить за это уже сегодня?')

  return {
    score,
    verdict: plain(raw?.verdict, 'Разбор завершён.'),
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
        temperature: 0.5,
        max_tokens: 2800,
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
