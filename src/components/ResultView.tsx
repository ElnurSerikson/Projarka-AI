import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Analysis, PivotResult } from '../types'
import { pivotIdea } from '../lib/llm'
import { Stepper, type Step } from './Stepper'
import { StepNav } from './StepNav'
import { VerdictSection } from './VerdictSection'
import { RoastSection } from './RoastSection'
import { OffersSection } from './OffersSection'
import { QuestionsSection } from './QuestionsSection'
import { PivotSection, type PivotStatus } from './PivotSection'

const STEPS: Step[] = [
  { id: 'verdict', label: 'Вердикт' },
  { id: 'offers', label: 'Оферы' },
  { id: 'questions', label: 'Вопросы' },
  { id: 'pivot', label: 'Докрутить' },
]
const PIVOT_INDEX = STEPS.length - 1

interface ResultViewProps {
  idea: string
  analysis: Analysis
  onReset: () => void
}

// Анимированная панель шага: монтируется заново по key={current} и въезжает по направлению.
function StepPanel({ direction, children }: { direction: number; children: ReactNode }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(r)
  }, [])
  return (
    <div
      className={[
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        shown
          ? 'translate-x-0 opacity-100'
          : `opacity-0 motion-reduce:translate-x-0 ${direction >= 0 ? 'translate-x-4' : '-translate-x-4'}`,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function ResultView({ idea, analysis, onReset }: ResultViewProps) {
  const [current, setCurrent] = useState(0)
  const [direction, setDirection] = useState(1)
  const [pivotStatus, setPivotStatus] = useState<PivotStatus>('idle')
  const [pivotResult, setPivotResult] = useState<PivotResult | null>(null)

  const goTo = useCallback((i: number) => {
    setCurrent((prev) => {
      if (i < 0 || i > PIVOT_INDEX || i === prev) return prev
      setDirection(i > prev ? 1 : -1)
      return i
    })
  }, [])

  // Авто-загрузка вариантов при входе на шаг «Докрутить».
  useEffect(() => {
    if (current !== PIVOT_INDEX || pivotStatus !== 'idle') return
    setPivotStatus('loading')
    pivotIdea(idea, analysis)
      .then((res) => {
        setPivotResult(res)
        setPivotStatus('done')
      })
      .catch(() => setPivotStatus('idle'))
  }, [current, pivotStatus, idea, analysis])

  // Навигация стрелками ←/→.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goTo(current + 1)
      else if (e.key === 'ArrowLeft') goTo(current - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, goTo])

  const renderStep = () => {
    switch (STEPS[current].id) {
      case 'verdict':
        return (
          <div className="space-y-6">
            <VerdictSection analysis={analysis} />
            <RoastSection forces={analysis.forces} />
          </div>
        )
      case 'offers':
        return <OffersSection offers={analysis.offers} />
      case 'questions':
        return <QuestionsSection questions={analysis.questions} score={analysis.score} />
      case 'pivot':
        return <PivotSection status={pivotStatus} result={pivotResult} score={analysis.score} />
      default:
        return null
    }
  }

  return (
    <div className="mt-8">
      <Stepper steps={STEPS} current={current} onJump={goTo} />

      <div className="my-8 min-h-[14rem]">
        <StepPanel key={current} direction={direction}>
          {renderStep()}
        </StepPanel>
      </div>

      <StepNav
        steps={STEPS}
        current={current}
        onPrev={() => goTo(current - 1)}
        onNext={() => goTo(current + 1)}
        onReset={onReset}
      />
    </div>
  )
}
