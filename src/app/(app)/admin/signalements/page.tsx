import { IssuesList } from '@/components/issues-list'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Signalements</h1>
        <p className="text-sm text-muted-foreground">Suivi et traitement des problèmes signalés.</p>
      </header>
      <IssuesList canManage />
    </div>
  )
}
