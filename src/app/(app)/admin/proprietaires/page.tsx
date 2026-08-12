import { UsersList } from '@/components/users-admin'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <UsersList role="owner" />
}
