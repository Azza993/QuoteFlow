import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'

export function NotFound() {
  return (
    <div className="mx-auto max-w-lg pt-10">
      <EmptyState
        icon={<Compass className="size-5" />}
        title="That page doesn't exist"
        description="The link may be out of date, or the quote may have been deleted."
        action={
          <Button asChild>
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  )
}
