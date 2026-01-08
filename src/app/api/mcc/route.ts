import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { getExcelFromStorage } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// In-memory cache
let cachedData: any = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface MCCCustomer {
  customer: string;
  revenue: Record<number, number>;
  cogs: Record<number, number>;
  gp: Record<number, number>;
  gpm: Record<number, number>;
  totalRevenue: number;
  totalCOGS: number;
  totalGP: number;
  avgGPM: number;
  trend: 'up' | 'down' | 'stable';
  yearsActive: number;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bustCache = url.searchParams.get('bust') === 'true';

    // Check cache
    const now = Date.now();
    if (!bustCache && cachedData && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json(cachedData);
    }

    // Try to get file from Supabase Storage first, then fall back to local
    let fileBuffer: Buffer | null = null;

    // Try Supabase Storage
    fileBuffer = await getExcelFromStorage('closeout-data.xlsx');

    // Fall back to local filesystem (for development)
    if (!fileBuffer) {
      const localPath = path.join(process.cwd(), 'data', 'closeout-data.xlsx');
      if (fs.existsSync(localPath)) {
        fileBuffer = fs.readFileSync(localPath);
      }
    }

    if (!fileBuffer) {
      return NextResponse.json({
        error: 'Data file not found',
        message: 'Please upload closeout-data.xlsx to Supabase Storage (data-files bucket)',
      }, { status: 404 });
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Parse MCC Margin Analysis sheet
    const mccSheet = workbook.Sheets['MCC Margin Analysis'];
    if (!mccSheet) {
      return NextResponse.json({
        error: 'MCC Margin Analysis sheet not found',
        message: 'The Excel file does not contain the MCC Margin Analysis tab',
      }, { status: 404 });
    }

    const mccRaw = XLSX.utils.sheet_to_json(mccSheet, { header: 1 }) as any[][];

    // Parse year headers from row 2 (index 1) - Revenue columns
    // Structure: A=empty, B=Customer, C-G=Revenue by year, H=Total, I-M=COGS by year, N=Total, O-S=GPM by year
    const years: number[] = [];
    const headerRow = mccRaw[1] || [];

    // Find year columns - typically columns C onwards contain years
    for (let col = 2; col < 7; col++) {
      const val = headerRow[col];
      if (typeof val === 'number' && val >= 2020 && val <= 2030) {
        years.push(val);
      }
    }

    // Default years if not found in header
    const mccYears = years.length > 0 ? years : [2021, 2022, 2023, 2024, 2025];

    const customers: MCCCustomer[] = [];

    // Parse data rows (starting from row 4, index 3)
    for (let i = 3; i < mccRaw.length; i++) {
      const row = mccRaw[i];
      const customerName = row[1];

      if (!customerName || typeof customerName !== 'string' || customerName.trim() === '') continue;
      if (customerName.toLowerCase().includes('total') || customerName.toLowerCase().includes('grand')) continue;

      const revenue: Record<number, number> = {};
      const cogs: Record<number, number> = {};
      const gp: Record<number, number> = {};
      const gpm: Record<number, number> = {};

      let totalRevenue = 0;
      let totalCOGS = 0;
      let yearsWithData = 0;
      let latestGPM = 0;
      let previousGPM = 0;

      mccYears.forEach((year, idx) => {
        // Revenue columns: 2-6 (C-G)
        const rev = parseFloat(row[2 + idx]) || 0;
        // COGS columns: 9-13 (J-N) - offset by 7 from revenue start
        const cost = parseFloat(row[9 + idx]) || 0;
        // GPM columns: 16-20 (Q-U) - offset by 14 from revenue start
        const gpmVal = row[16 + idx];
        const margin = typeof gpmVal === 'number' ? gpmVal : 0;

        revenue[year] = rev;
        cogs[year] = cost;
        gp[year] = rev - cost;
        gpm[year] = margin;

        totalRevenue += rev;
        totalCOGS += cost;

        if (rev > 0) {
          yearsWithData++;
          previousGPM = latestGPM;
          latestGPM = margin;
        }
      });

      // Skip customers with no data
      if (totalRevenue === 0) continue;

      const totalGP = totalRevenue - totalCOGS;
      const avgGPM = totalRevenue > 0 ? totalGP / totalRevenue : 0;

      // Determine trend based on last 2 years with data
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (latestGPM > previousGPM + 0.02) trend = 'up';
      else if (latestGPM < previousGPM - 0.02) trend = 'down';

      customers.push({
        customer: customerName.trim(),
        revenue,
        cogs,
        gp,
        gpm,
        totalRevenue,
        totalCOGS,
        totalGP,
        avgGPM,
        trend,
        yearsActive: yearsWithData,
      });
    }

    // Sort by total revenue descending
    customers.sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Calculate KPIs
    const totalMCCRevenue = customers.reduce((sum, c) => sum + c.totalRevenue, 0);
    const totalMCCCOGS = customers.reduce((sum, c) => sum + c.totalCOGS, 0);
    const totalMCCGP = totalMCCRevenue - totalMCCCOGS;
    const overallGPM = totalMCCRevenue > 0 ? totalMCCGP / totalMCCRevenue : 0;

    // At-risk customers (GPM < 50% or declining trend)
    const atRiskCustomers = customers.filter(c => c.avgGPM < 0.5 || c.trend === 'down');

    // High performers (GPM >= 60%)
    const highPerformers = customers.filter(c => c.avgGPM >= 0.6);

    // Year-over-year totals
    const yearTotals: Record<number, { revenue: number; cogs: number; gp: number; gpm: number; customerCount: number }> = {};
    mccYears.forEach(year => {
      let yearRevenue = 0;
      let yearCOGS = 0;
      let customerCount = 0;

      customers.forEach(c => {
        if (c.revenue[year] > 0) {
          yearRevenue += c.revenue[year];
          yearCOGS += c.cogs[year];
          customerCount++;
        }
      });

      const yearGP = yearRevenue - yearCOGS;
      yearTotals[year] = {
        revenue: yearRevenue,
        cogs: yearCOGS,
        gp: yearGP,
        gpm: yearRevenue > 0 ? yearGP / yearRevenue : 0,
        customerCount,
      };
    });

    // GPM distribution buckets
    const gpmDistribution = {
      excellent: customers.filter(c => c.avgGPM >= 0.65).length,
      good: customers.filter(c => c.avgGPM >= 0.55 && c.avgGPM < 0.65).length,
      average: customers.filter(c => c.avgGPM >= 0.45 && c.avgGPM < 0.55).length,
      poor: customers.filter(c => c.avgGPM < 0.45).length,
    };

    const responseData = {
      kpis: {
        totalRevenue: totalMCCRevenue,
        totalCOGS: totalMCCCOGS,
        totalGrossProfit: totalMCCGP,
        overallGPM,
        customerCount: customers.length,
        atRiskCount: atRiskCustomers.length,
        highPerformerCount: highPerformers.length,
        avgRevenuePerCustomer: customers.length > 0 ? totalMCCRevenue / customers.length : 0,
      },
      customers,
      atRiskCustomers: atRiskCustomers.slice(0, 10),
      highPerformers: highPerformers.slice(0, 10),
      yearTotals,
      years: mccYears,
      gpmDistribution,
      lastUpdated: new Date().toISOString(),
    };

    // Cache result
    cachedData = responseData;
    cacheTimestamp = Date.now();

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error reading MCC data:', error);
    return NextResponse.json({
      error: 'Failed to read MCC data',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
