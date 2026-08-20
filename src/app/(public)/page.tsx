import Link from 'next/link'
import { ArrowRight, Building2, KeyRound, ShieldCheck, Check } from 'lucide-react'
import { HomeHero } from '@/components/home-hero'
import { Parallax, WordReveal, Rise, CountUp, DrawLine } from '@/components/home-motion'
import { SmartImage } from '@/components/smart-image'
import { HOME_IMAGES } from '@/lib/listing-images'

export const metadata = {
  title: 'Pron Gérance — Gérance immobilière au Kosovo',
  description:
    'Gérance immobilière à Ferizaj et dans tout le Kosovo : annonces, baux, loyers et suivi pour propriétaires de la diaspora et locataires.',
}

/* ============================ Bloc « feature » ============================ */
function Feature({
  index,
  eyebrow,
  icon: Icon,
  title,
  text,
  points,
  image,
  imageFallback,
  imageAlt,
  reversed = false,
}: {
  index: string
  eyebrow: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  text: string
  points: string[]
  image: string
  imageFallback?: string
  imageAlt: string
  reversed?: boolean
}) {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      {/* Numéro filigrane */}
      <span
        aria-hidden
        className={`font-display pointer-events-none absolute -top-6 select-none text-[9rem] leading-none font-semibold text-foreground/[0.045] sm:text-[14rem] ${
          reversed ? 'right-2' : 'left-2'
        }`}
      >
        {index}
      </span>

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-4 lg:px-8">
        {/* Image */}
        <div className={reversed ? 'lg:col-span-6 lg:col-start-1' : 'lg:col-span-6 lg:col-start-7'}>
          <Rise y={40}>
            <Parallax amount={40} className="aspect-[4/5] rounded-[10px] border border-border sm:aspect-[4/3]">
              <SmartImage
                sources={[image, imageFallback]}
                alt={imageAlt}
                className="h-full w-full object-cover"
              />
            </Parallax>
          </Rise>
        </div>

        {/* Texte */}
        <div
          className={
            reversed
              ? 'lg:col-span-5 lg:col-start-8 lg:row-start-1'
              : 'lg:col-span-5 lg:col-start-1 lg:row-start-1'
          }
        >
          <Rise>
            <div className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 text-primary" />
              <span className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
                {eyebrow}
              </span>
            </div>
          </Rise>
          <WordReveal
            as="h2"
            text={title}
            className="font-display mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.08]"
          />
          <Rise delay={0.1}>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">{text}</p>
            <ul className="mt-6 space-y-3">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-foreground">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Check className="h-3 w-3 text-primary" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </Rise>
        </div>
      </div>
    </section>
  )
}

/* ================================= Page ================================== */
export default function HomePage() {
  return (
    <>
      <HomeHero />

      {/* Manifeste éditorial */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Rise>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
                Notre approche
              </p>
              <DrawLine className="mt-4 w-16" />
            </Rise>
          </div>
          <div className="lg:col-span-9">
            <WordReveal
              as="p"
              text="Gérer un bien à distance ne devrait jamais rimer avec renoncer au contrôle."
              className="font-display text-2xl leading-[1.3] font-medium tracking-tight text-foreground sm:text-[2.4rem] sm:leading-[1.25]"
            />
            <Rise delay={0.2}>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
                Pron Gérance administre appartements, maisons et locaux partout au Kosovo —
                de Prishtinë à Prizren, de Ferizaj à Gjilan — avec la rigueur d’une régie et
                la transparence d’un relevé.
                <span className="text-foreground"> Chaque loyer, chaque document, chaque échéance : tracé, horodaté, consultable.</span>
              </p>
            </Rise>
          </div>
        </div>
      </section>

      <Feature
        index="01"
        eyebrow="Propriétaires — Diaspora"
        icon={Building2}
        title="Gérez vos biens depuis l’étranger, l’esprit tranquille."
        text="Où que vous soyez, gardez la main sur votre patrimoine au Kosovo. Loyers encaissés, échéances et rapports centralisés — sans un seul déplacement."
        points={[
          'Suivi des loyers et des retards en temps réel',
          'Quittances et documents archivés au même endroit',
          'Un interlocuteur unique, en shqip, français ou allemand',
        ]}
        image={HOME_IMAGES.owners}
        imageAlt="Suivi de gestion à distance"
      />

      <div className="bg-card/60">
        <Feature
          index="02"
          eyebrow="Locataires"
          icon={KeyRound}
          title="Un logement suivi, une relation directe avec la régie."
          text="Déclarez un paiement, signalez un problème avec photos, échangez avec la régie — tout se fait en quelques clics, depuis votre espace."
          points={[
            'Bail et quittances accessibles à tout moment',
            'Signalements avec photos et suivi de résolution',
            'Messagerie directe avec un temps de réponse court',
          ]}
          image={HOME_IMAGES.tenants}
          imageAlt="Intérieur d’un logement"
          reversed
        />
      </div>

      {/* Bandeau chiffres — vert profond (section standout) */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-5">
              <Rise>
                <p className="text-[11px] font-semibold tracking-[0.2em] text-primary-foreground/70 uppercase">
                  La confiance, en chiffres
                </p>
              </Rise>
              <WordReveal
                as="h2"
                text="Une exigence, à l’échelle du pays."
                className="font-display mt-4 text-3xl font-semibold tracking-tight sm:text-[2.6rem] sm:leading-[1.1]"
              />
              <Rise delay={0.15}>
                <p className="mt-5 max-w-sm leading-relaxed text-primary-foreground/80">
                  De Ferizaj à Prishtinë, de Prizren à Gjilan — une gestion homogène,
                  tenue avec la même rigueur partout.
                </p>
              </Rise>
            </div>

            <div className="lg:col-span-7">
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-primary-foreground/15 bg-primary-foreground/10">
                {[
                  { v: <CountUp to={22} suffix="" />, l: 'Villes couvertes au Kosovo' },
                  { v: <CountUp to={3} suffix="" />, l: 'Langues : shqip · français · allemand' },
                  { v: <CountUp to={100} suffix=" %" />, l: 'Historique conservé et horodaté' },
                  { v: '24/7', l: 'Accès à vos documents, où que vous soyez' },
                ].map((s, i) => (
                  <Rise key={i} delay={i * 0.08} className="bg-transparent p-6 sm:p-8">
                    <p className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                      {s.v}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{s.l}</p>
                  </Rise>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Citation + visuel */}
      <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <Rise>
              <ShieldCheck className="h-7 w-7 text-primary" />
            </Rise>
            <WordReveal
              as="p"
              text="« La confiance ne se déclare pas. Elle se prouve, ligne après ligne. »"
              stagger={0.045}
              className="font-display mt-6 text-3xl leading-[1.25] font-medium tracking-tight text-foreground sm:text-[2.75rem] sm:leading-[1.18]"
            />
            <Rise delay={0.2}>
              <p className="mt-6 text-sm font-medium tracking-wide text-muted-foreground uppercase">
                — Pron Gérance, Kosovo
              </p>
            </Rise>
          </div>
          <div className="lg:col-span-5">
            <Rise y={40}>
              <Parallax amount={45} className="aspect-[3/4] rounded-[10px] border border-border">
                <SmartImage
                  sources={[HOME_IMAGES.quote, HOME_IMAGES.quoteFallback]}
                  alt="Architecture"
                  className="h-full w-full object-cover"
                />
              </Parallax>
            </Rise>
          </div>
        </div>
      </section>

      {/* Bande pleine largeur — atmosphère */}
      <section className="relative h-[45vh] min-h-[320px] overflow-hidden sm:h-[55vh]">
        <Parallax amount={80} className="absolute inset-0">
          <SmartImage
            sources={[HOME_IMAGES.band, HOME_IMAGES.bandFallback]}
            alt=""
            className="h-full w-full object-cover"
          />
        </Parallax>
        <div className="absolute inset-0 bg-gradient-to-t from-[#12100c]/80 via-[#12100c]/35 to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
            <WordReveal
              as="p"
              text="Du Kosovo à la diaspora, une même exigence."
              className="font-display max-w-2xl text-2xl font-semibold tracking-tight text-white sm:text-4xl"
            />
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <SmartImage
            sources={[HOME_IMAGES.city]}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#12100c]/90 via-[#12100c]/70 to-[#12100c]/45" />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <WordReveal
            as="h2"
            text="Un bien à confier, un logement à trouver ?"
            className="font-display max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-[3rem] sm:leading-[1.05]"
          />
          <Rise delay={0.2}>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
              Parcourez les annonces disponibles dans tout le Kosovo, ou accédez à votre
              espace pour piloter vos biens et vos baux.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/annonces"
                className="group inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-xl shadow-black/25 transition-colors hover:bg-[color-mix(in_oklch,var(--primary),black_16%)]"
              >
                Voir les annonces
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center rounded-lg border border-white/30 bg-white/5 px-6 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/15"
              >
                Espace client
              </Link>
            </div>
          </Rise>
        </div>
      </section>
    </>
  )
}
