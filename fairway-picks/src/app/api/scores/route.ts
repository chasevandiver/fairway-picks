import { NextResponse } from 'next/server'
import { fetchLiveScores } from '@/lib/espn'

export const runtime = 'edge'
export const revalidate = 0

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tournamentName = searchParams.get('tournament') || undefined
  const scores = await fetchLiveScores(tournamentName)
  return NextResponse.json(scores)
}
