import { NextResponse } from 'next/server';
import { generateInsights } from '@/lib/hermes/insights';

/**
 * GET /api/insights?days=30
 *
 * Generate comprehensive session analytics for the dashboard.
 * Accepts optional `days` query parameter (default: 30).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10), 1), 365) : 30;

    if (isNaN(days)) {
      return NextResponse.json(
        { error: 'Invalid days parameter' },
        { status: 400 }
      );
    }

    const report = await generateInsights(days);
    return NextResponse.json(report);
  } catch (error) {
    console.error('[Insights API] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}
