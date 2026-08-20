import { LoginForm } from '@/components/login-form'

export const metadata = {
  title: 'Connexion | Pron Gérance',
}

/**
 * Page de connexion (publique). Un utilisateur DÉJÀ connecté qui arrive ici est
 * redirigé vers son espace par le middleware — inutile de le gérer ici.
 *
 * Next 15 : searchParams est asynchrone.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string }>
}) {
  const { redirectedFrom } = await searchParams

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <LoginForm redirectTo={redirectedFrom} />
    </main>
  )
}
