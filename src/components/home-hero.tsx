'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { SmartImage } from '@/components/smart-image'
import { WordReveal } from '@/components/home-motion'
import { HOME_IMAGES } from '@/lib/listing-images'

const EASE = [0.22, 1, 0.36, 1] as const

const META = [
  { k: 'Tout le Kosovo', v: '22 villes couvertes' },
  { k: 'SQ · FR · DE', v: 'Diaspora multilingue' },
  { k: 'Temps réel', v: 'Loyers & suivi' },
]

/**
 * Hero immersif quasi plein écran : grande image d'architecture, parallax au
 * scroll + léger zoom continu, titre serif révélé mot par mot. Dégradé chaud
 * pour le contraste — jamais de « dark SaaS ».
 */
export function HomeHero() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '22%'])
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15])
  const overlay = useTransform(scrollYProgress, [0, 1], [0.5, 0.82])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <section ref={ref} className="relative flex min-h-[93vh] flex-col justify-end overflow-hidden">
      {/* Fond : parallax + zoom lent continu */}
      <motion.div style={{ y, scale }} className="absolute inset-0 -z-10">
        <motion.div
          className="h-full w-full"
          initial={{ scale: 1 }}
          animate={{ scale: 1.08 }}
          transition={{ duration: 16, ease: 'easeInOut', repeat: Infinity, repeatType: 'reverse' }}
        >
          <SmartImage
            sources={[HOME_IMAGES.hero, HOME_IMAGES.heroFallback]}
            alt="Architecture — Kosovo"
            loading="eager"
            className="h-full w-full object-cover"
          />
        </motion.div>
      </motion.div>

      {/* Dégradés : lisibilité + profondeur */}
      <motion.div
        style={{ opacity: overlay }}
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[#171208] via-[#171208]/40 to-[#171208]/10"
      />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_80%_at_50%_120%,rgba(20,15,8,0.55),transparent)]" />

      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-32 sm:px-6 sm:pb-20 lg:px-8">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.24em] text-white/85 uppercase"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          Gérance immobilière — tout le Kosovo
        </motion.p>

        <WordReveal
          as="h1"
          trigger="mount"
          text="Vos biens au Kosovo, gérés d’une main sûre."
          delay={0.15}
          className="font-display mt-6 max-w-4xl text-[2.9rem] leading-[1.0] font-semibold tracking-tight text-white sm:text-6xl lg:text-[5rem]"
        />

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
          className="mt-7 max-w-xl text-lg leading-relaxed text-white/85"
        >
          Loyers, baux, documents et signalements centralisés. Pour les propriétaires
          de la diaspora comme pour les locataires — suivis à distance, en toute confiance.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.62, ease: EASE }}
          className="mt-9 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/annonces"
            className="group inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xl shadow-black/25 transition-colors hover:bg-[color-mix(in_oklch,var(--primary),black_16%)]"
          >
            Voir les annonces
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-lg border border-white/30 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/15"
          >
            Espace client
          </Link>
        </motion.div>

        {/* Bandeau méta */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.78, ease: EASE }}
          className="mt-14 grid max-w-2xl grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-white/15 bg-white/10 backdrop-blur-sm"
        >
          {META.map((m) => (
            <div key={m.k} className="bg-transparent px-4 py-3.5">
              <p className="font-display text-sm font-medium text-white sm:text-base">{m.k}</p>
              <p className="mt-0.5 text-[11px] text-white/70">{m.v}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Indice de défilement */}
      <motion.div
        style={{ opacity: fade }}
        className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex"
      >
        <span className="text-[10px] font-medium tracking-[0.2em] text-white/70 uppercase">Défiler</span>
        <motion.span
          className="h-8 w-px bg-white/50"
          animate={{ scaleY: [0.3, 1, 0.3], originY: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </section>
  )
}
