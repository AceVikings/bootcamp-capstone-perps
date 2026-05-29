import { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  ColorType,
} from 'lightweight-charts';
import type { Trade } from '../../lib/api';

interface Props {
  trades: Trade[];
  timeframe?: '1m' | '5m' | '15m' | '1h';
}

const TF_SECONDS: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };

function buildCandles(trades: Trade[], tf: number): CandlestickData[] {
  if (!trades.length) return [];
  const buckets = new Map<number, { open: number; high: number; low: number; close: number; time: number }>();
  for (const t of trades) {
    const bucket = Math.floor(t.ts / tf) * tf;
    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { open: t.price, high: t.price, low: t.price, close: t.price, time: bucket });
    } else {
      existing.high = Math.max(existing.high, t.price);
      existing.low = Math.min(existing.low, t.price);
      existing.close = t.price;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time) as CandlestickData[];
}

export function PriceChart({ trades, timeframe = '15m' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<'Candlestick', any> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#050410' },
        textColor: '#8E8A9E',
      },
      grid: {
        vertLines: { color: '#252340' },
        horzLines: { color: '#252340' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#252340' },
      timeScale: { borderColor: '#252340', timeVisible: true },
      width: el.clientWidth,
      height: 280,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#4A9E64',
      downColor: '#A85858',
      borderUpColor: '#4A9E64',
      borderDownColor: '#A85858',
      wickUpColor: '#4A9E64',
      wickDownColor: '#A85858',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      chart.resize(el.clientWidth, 280);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const candles = buildCandles(trades, TF_SECONDS[timeframe] ?? 900);
    seriesRef.current.setData(candles);
  }, [trades, timeframe]);

  return <div ref={containerRef} className="w-full h-[280px]" aria-label="Price chart" />;
}
