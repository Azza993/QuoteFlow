import { useContext } from 'react'
import { DataContext, type DataContextValue } from '@/data/DataProvider'

export function useData(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside a <DataProvider>')
  return context
}
