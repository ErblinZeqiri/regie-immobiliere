'use client'

import { motion, useScroll, useTransform, useInView, animate } from 'motion/react'
import { createElement, Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const EASE = [0.22, 1, 0.36, 1] as const

/* -------------------------------------------------------------------------- */
/*  Parallax — déplace une image plus lentement que le scroll.                */
/* -------------------------------------------------------------------------- */
export function Parallax({
  children,
  amount = 70,
  className,
}: {
  children: ReactNode
  amount?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [-amount, amount])
  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      <motion.div style={{ y }} className="absolute inset-[-12%]">
        {children}
      </motion.div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  WordReveal — révèle un titre mot par mot, en masque (slide up).           */
/*  Piloté par useInView (fiable) plutôt que whileInView par mot.             */
/* -------------------------------------------------------------------------- */
export function WordReveal({
  text,
  as = 'div',
  className,
  delay = 0,
  stagger = 0.055,
  trigger = 'inView',
}: {
  text: string
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'div'
  className?: string
  delay?: number
  stagger?: number
  /** 'mount' pour un titre déjà visible au chargement (hero) ; 'inView' sinon. */
  trigger?: 'inView' | 'mount'
}) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.25 })
  const show = trigger === 'mount' ? true : inView
  const words = text.split(' ')
  return createElement(
    as,
    { className, ref },
    words.map((w, i) => (
      <Fragment key={i}>
        <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: '115%' }}
            animate={show ? { y: 0 } : { y: '115%' }}
            transition={{ duration: 0.75, delay: delay + i * stagger, ease: EASE }}
          >
            {w}
          </motion.span>
        </span>
        {i < words.length - 1 ? ' ' : ''}
      </Fragment>
    )),
  )
}

/* -------------------------------------------------------------------------- */
/*  Rise — apparition douce (translateY + fade) à l'entrée dans le viewport.  */
/* -------------------------------------------------------------------------- */
export function Rise({
  children,
  delay = 0,
  className,
  y = 28,
}: {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.25 })
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*  CountUp — compteur animé quand la valeur entre dans le viewport.          */
/* -------------------------------------------------------------------------- */
export function CountUp({
  to,
  prefix = '',
  suffix = '',
  duration = 1.8,
  className,
}: {
  to: number
  prefix?: string
  suffix?: string
  duration?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, { duration, ease: EASE, onUpdate: (v) => setVal(v) })
    return () => controls.stop()
  }, [inView, to, duration])
  return (
    <span ref={ref} className={className}>
      {prefix}
      {Math.round(val)}
      {suffix}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  DrawLine — trait horizontal qui se dessine à l'entrée dans le viewport.   */
/* -------------------------------------------------------------------------- */
export function DrawLine({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  return (
    <motion.div
      ref={ref}
      className={cn('h-px origin-left bg-border', className)}
      initial={{ scaleX: 0 }}
      animate={inView ? { scaleX: 1 } : { scaleX: 0 }}
      transition={{ duration: 1, ease: EASE }}
    />
  )
}
