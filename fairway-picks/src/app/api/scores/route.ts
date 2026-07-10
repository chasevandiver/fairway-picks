
import { NextResponse } from 'next/server'
import { fetchLiveScores } from '@/lib/espn'

// Node.js runtime (not 'edge') — ISR/revalidate is not supported on the Edge
// Runtime for route handlers, so `revalidate` below was silently ignored and
// this endpoint served its first-ever cached response indefinitely.
export const revalidate = 120

export async function GET() {
  const scores = await fetchLiveScores()
  return NextResponse.json(scores)
}
