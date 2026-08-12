import Link from 'next/link'
import { Building2, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = {
  title: 'Régie Ferizaj — Gestion locative',
  description:
    'Gestion locative à Ferizaj : annonces, baux, loyers et suivi pour propriétaires et locataires.',
}

const FEATURES = [
  {
    icon: Building2,
    title: 'Propriétaires',
    text: 'Suivez vos biens, vos loyers encaissés et vos rapports — même depuis la diaspora.',
  },
  {
    icon: KeyRound,
    title: 'Locataires',
    text: 'Consultez votre bail, déclarez vos paiements et signalez un problème en un clic.',
  },
  {
    icon: ShieldCheck,
    title: 'Transparence',
    text: 'Quittances, documents et échéances centralisés et accessibles à tout moment.',
  },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28 lg:py-32">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Ferizaj, Kosovo
          </span>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Gestion locative à <span className="text-primary">Ferizaj</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Nous gérons vos appartements de A à Z — pour les propriétaires de la diaspora
            comme pour les locataires. Loyers, baux, documents et signalements, réunis au
            même endroit.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" render={<Link href="/annonces" />}>
              Voir les annonces
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/login" />}>
              Espace client
            </Button>
          </div>
        </div>
      </section>

      {/* Ce que nous faisons */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <Card key={f.title}>
                <CardContent className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>
    </>
  )
}
