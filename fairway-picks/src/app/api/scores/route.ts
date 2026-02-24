import { NextResponse } from 'next/server'
import { fetchLiveScores } from '@/lib/espn'

export const runtime = 'edge'
export const revalidate = 120

export async function GET() {
  const scores = await fetchLiveScores()
  return NextResponse.json(scores)
}
