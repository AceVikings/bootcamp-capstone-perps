import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletGate } from '../components/app/WalletGate';
import { OrderBook } from '../components/app/OrderBook';
import { OrderForm } from '../components/app/OrderForm';
import { TradeList } from '../components/app/TradeList';
import { PriceChart } from '../components/app/PriceChart';
import { DepthNavigator } from '../components/app/DepthNavigator';
import { TokenTypeBadge } from '../components/app/TokenTypeBadge';
import { useMarketSocket } from '../lib/ws';
import { useTrades } from '../hooks';
import { api } from '../lib/api';
import { fmtUsdc, fmtCountdown } from '../lib/format';

type Timeframe = '1m' | '5m' | '15m' | '1h';

interface Props {
  market: string; // token mint
  tokenType?: string;
  epoch?: { ref_price: number; end_ts: number } | null;
  onNavigate: (hash: string) => void;
}

export function Trade({ market, tokenType = 'long', epoch, onNavigate }: Props) {
  const { connected, publicKey } = useWallet();
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [prefillPrice, setPrefillPrice] = useState<number | undefined>();

  const { orderbook, recentTrades: wsTrades, lastPrice, connected: wsConnected } = useMarketSocket(market);
  const { data: httpTrades } = useTrades(market);

  // Merge WS trades with HTTP trades (WS is more recent)
  const allTrades = wsTrades.length > 0 ? wsTrades : (httpTrades ?? []);

  async function handleOrder(side: 'buy' | 'sell', price: number, size: number) {
    if (!publicKey) throw new Error('Wallet not connected');
    await api.orders.create({
      wallet: publicKey.toBase58(),
      mint: market,
      side,
      price,
      size,
      signature: 'pending', // wallet signs on-chain settlement separately
    });
  }

  const displayPrice = lastPrice ?? orderbook?.last_price;

  return (
    <div className="min-h-screen bg-void pt-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">

        {/* Market header */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <TokenTypeBadge type={tokenType} />
          <span className="font-mono text-xs text-fg-muted">{market.slice(0, 8)}…</span>
          {displayPrice != null && (
            <span className="font-mono text-lg text-fg">${fmtUsdc(displayPrice, 4)}</span>
          )}
          {epoch && (
            <>
              <span className="font-mono text-xs text-fg-muted">
                Ref: ${fmtUsdc(epoch.ref_price, 4)}
              </span>
              <span className="font-mono text-xs text-accent">
                {fmtCountdown(epoch.end_ts)}
              </span>
            </>
          )}
          <span className={`font-mono text-[9px] uppercase tracking-widest ml-auto ${wsConnected ? 'text-bull' : 'text-fg-muted'}`}>
            {wsConnected ? '● Live' : '○ Offline'}
          </span>
        </div>

        {/* Depth navigator */}
        <div className="mb-6">
          <DepthNavigator
            tokenType={tokenType}
            depth={tokenType.split('_').length - 1}
            onNavigate={key => onNavigate(`#/app/trade/${key}`)}
          />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

          {/* LEFT: Chart + info */}
          <div className="space-y-4">
            {/* Timeframe selector */}
            <div className="flex gap-1" role="group" aria-label="Chart timeframe">
              {(['1m', '5m', '15m', '1h'] as Timeframe[]).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`font-mono text-[10px] tracking-widest uppercase px-3 py-1 border transition-colors ${
                    timeframe === tf
                      ? 'border-accent text-accent bg-accent/10'
                      : 'border-wire text-fg-muted hover:text-fg'
                  }`}
                  aria-pressed={timeframe === tf}
                >
                  {tf}
                </button>
              ))}
            </div>

            <div className="bg-[#050410] border border-wire">
              <PriceChart trades={allTrades} timeframe={timeframe} />
            </div>
          </div>

          {/* RIGHT: Orderbook + form + trades */}
          <div className="space-y-4">
            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
                Order Book
              </h3>
              <OrderBook data={orderbook} onPriceClick={setPrefillPrice} />
            </div>

            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
                Place Order
              </h3>
              <WalletGate walletConnected={connected}>
                <OrderForm
                  prefillPrice={prefillPrice}
                  onSubmit={handleOrder}
                  disabled={!connected}
                />
              </WalletGate>
            </div>

            <div className="bg-surface border border-wire p-4">
              <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
                Recent Trades
              </h3>
              <TradeList trades={allTrades} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
