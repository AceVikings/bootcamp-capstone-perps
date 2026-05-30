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
import { useTrades, useOrderBook, useMyOrders, useTokenBalance } from '../hooks';
import { api } from '../lib/api';
import { fmtUsdc } from '../lib/format';

type Timeframe = '1m' | '5m' | '15m' | '1h';

interface Props {
  market: string; // token mint
  tokenType?: string;
  onNavigate: (hash: string) => void;
}

export function Trade({ market, tokenType = 'long', onNavigate }: Props) {
  const { connected, publicKey, signMessage } = useWallet();
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [prefillPrice, setPrefillPrice] = useState<number | undefined>();

  const traderKey = publicKey?.toBase58() ?? null;

  const { orderbook: wsOrderbook, lastPrice: wsLastPrice, connected: wsConnected } = useMarketSocket(market);
  const { data: httpBook } = useOrderBook(market);
  const { data: httpTrades } = useTrades(market);
  const { data: myOrders } = useMyOrders(connected ? market : null, traderKey);
  const { balance: tokenBalance } = useTokenBalance(connected ? market : null, traderKey);

  // Use WS orderbook for live updates; fall back to HTTP book on initial load
  const orderbook = wsOrderbook ?? httpBook;
  // Derive mid-price from HTTP book when WS hasn't fired yet
  const httpLastPrice = httpBook
    ? httpBook.bids[0] != null && httpBook.asks[0] != null
      ? (httpBook.bids[0].price_usdc + httpBook.asks[0].price_usdc) / 2 / 1e6
      : httpBook.bids[0]?.price_usdc != null
      ? httpBook.bids[0].price_usdc / 1e6
      : httpBook.asks[0]?.price_usdc != null
      ? httpBook.asks[0].price_usdc / 1e6
      : null
    : null;
  const lastPrice = wsLastPrice ?? httpLastPrice;

  const allTrades = httpTrades ?? [];

  async function handleOrder(side: 'buy' | 'sell', price: number, size: number) {
    if (!publicKey || !signMessage) throw new Error('Wallet not connected');
    const trader = publicKey.toBase58();
    const sideUpper = side.toUpperCase() as 'BUY' | 'SELL';
    // Convert decimal USDC/tokens to integer micro-units (6 decimal places)
    const quantity = Math.round(size * 1_000_000);
    const priceUsdc = Math.round(price * 1_000_000);
    const nonce = Date.now();
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    // Sign canonical message: "<trader>|<token_mint>|<side>|<quantity>|<price_usdc>|<nonce>|<expiry>"
    const msg = `${trader}|${market}|${sideUpper}|${quantity}|${priceUsdc}|${nonce}|${expiry}`;
    const sigBytes = await signMessage(new TextEncoder().encode(msg));
    const signature = btoa(String.fromCharCode(...sigBytes));
    await api.orders.create({
      trader,
      token_mint: market,
      side: sideUpper,
      quantity,
      price_usdc: priceUsdc,
      nonce,
      expiry,
      signature,
    });
  }

  const displayPrice = lastPrice;

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
              <OrderBook data={orderbook} lastPrice={lastPrice} onPriceClick={setPrefillPrice} />
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
                  tokenBalance={tokenBalance}
                />
              </WalletGate>
            </div>

            {connected && (
              <div className="bg-surface border border-wire p-4">
                <h3 className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted mb-3">
                  My Position
                </h3>
                <div className="mb-3 flex justify-between items-center">
                  <span className="font-mono text-[10px] text-fg-muted">Token Balance</span>
                  <span className="font-mono text-xs text-fg">
                    {tokenBalance != null
                      ? tokenBalance.toLocaleString('en-US', { maximumFractionDigits: 4 })
                      : '—'} tokens
                  </span>
                </div>

                {/* Collateral-efficiency split CTA */}
                {tokenBalance != null && tokenBalance > 0 && (
                  <div className="mb-3 rounded border border-accent/30 bg-accent/5 px-3 py-2.5 text-[10px] font-mono text-fg-muted leading-snug">
                    <p className="text-fg mb-1.5">
                      Use as collateral — no extra USDC required.
                    </p>
                    <p className="mb-2">
                      Split this token to access the next strike and receive a spread component
                      you can sell or hold.
                    </p>
                    <button
                      onClick={() => onNavigate(`#/app/split/${market}`)}
                      className="w-full px-3 py-2 bg-accent/15 border border-accent/40 text-accent hover:bg-accent/25 transition-colors uppercase tracking-widest text-[9px]"
                    >
                      Split → Higher Strike ↗
                    </button>
                  </div>
                )}
                {myOrders && myOrders.length > 0 ? (
                  <table className="w-full font-mono text-[10px]">
                    <thead>
                      <tr className="border-b border-wire text-fg-muted">
                        <th className="text-left py-1">Side</th>
                        <th className="text-right py-1">Price</th>
                        <th className="text-right py-1">Size</th>
                        <th className="text-right py-1">Filled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myOrders.map(o => (
                        <tr key={o.id} className={o.side === 'BUY' ? 'text-bull' : 'text-bear'}>
                          <td className="py-1">{o.side}</td>
                          <td className="text-right py-1">${(o.price_usdc / 1e6).toFixed(4)}</td>
                          <td className="text-right py-1">{(o.quantity / 1e6).toFixed(2)}</td>
                          <td className="text-right py-1">{(o.filled_qty / 1e6).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="font-mono text-[10px] text-fg-muted">No open orders</p>
                )}
              </div>
            )}

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

