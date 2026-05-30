import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MarketTicker } from './components/MarketTicker';
import { Stats } from './components/Stats';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { TokenMechanics } from './components/TokenMechanics';
import { CTA } from './components/CTA';
import { Footer } from './components/Footer';
import Docs from './pages/Docs';
import { Dashboard } from './pages/Dashboard';
import { Trade } from './pages/Trade';
import { Portfolio } from './pages/Portfolio';
import { Split } from './pages/Split';
import { Merge } from './pages/Merge';
import { Deposit } from './pages/Deposit';
import { VaultDetail } from './pages/VaultDetail';
import { Settle } from './pages/Settle';

type Route =
  | { page: 'home' }
  | { page: 'docs' }
  | { page: 'app' }
  | { page: 'trade'; market: string }
  | { page: 'portfolio' }
  | { page: 'split'; nodeId: string }
  | { page: 'merge'; nodeId: string }
  | { page: 'deposit' }
  | { page: 'vault'; pubkey: string }
  | { page: 'settle'; pubkey: string };

function parseHash(hash: string): Route {
  if (!hash || hash === '#' || hash === '#/') return { page: 'home' };
  if (hash === '#/docs') return { page: 'docs' };
  if (hash === '#/app' || hash === '#/app/') return { page: 'app' };
  if (hash === '#/app/portfolio') return { page: 'portfolio' };
  if (hash === '#/app/deposit') return { page: 'deposit' };

  const tradeMatch = hash.match(/^#\/app\/trade\/(.+)$/);
  if (tradeMatch) return { page: 'trade', market: tradeMatch[1] };

  const splitMatch = hash.match(/^#\/app\/split\/(.+)$/);
  if (splitMatch) return { page: 'split', nodeId: splitMatch[1] };

  const mergeMatch = hash.match(/^#\/app\/merge\/(.+)$/);
  if (mergeMatch) return { page: 'merge', nodeId: mergeMatch[1] };

  const vaultMatch = hash.match(/^#\/app\/vault\/(.+)$/);
  if (vaultMatch) return { page: 'vault', pubkey: vaultMatch[1] };

  const settleMatch = hash.match(/^#\/app\/settle\/(.+)$/);
  if (settleMatch) return { page: 'settle', pubkey: settleMatch[1] };

  return { page: 'home' };
}

function useHashPage() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash.replace(/^#/, '') || '/';
    setRoute(parseHash(hash));
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => navigate(''), [navigate]);

  return { route, navigate, goHome };
}

function App() {
  const { route, navigate } = useHashPage();

  if (route.page === 'docs') {
    return <Docs />;
  }

  if (route.page === 'app') {
    return (
      <>
        <Navbar />
        <Dashboard onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'trade') {
    return (
      <>
        <Navbar />
        <Trade market={route.market} onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'portfolio') {
    return (
      <>
        <Navbar />
        <Portfolio onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'split') {
    return (
      <>
        <Navbar />
        <Split nodeId={route.nodeId} onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'merge') {
    return (
      <>
        <Navbar />
        <Merge nodeId={route.nodeId} onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'deposit') {
    return (
      <>
        <Navbar />
        <Deposit onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'vault') {
    return (
      <>
        <Navbar />
        <VaultDetail pubkey={route.pubkey} onNavigate={navigate} />
      </>
    );
  }

  if (route.page === 'settle') {
    return (
      <>
        <Navbar />
        <Settle pubkey={route.pubkey} onNavigate={navigate} />
      </>
    );
  }

  // Default: home/landing
  return (
    <>
      {/* Skip to main content — accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-accent focus:text-void focus:font-mono focus:text-xs focus:tracking-widest focus:uppercase"
      >
        Skip to main content
      </a>

      <Navbar />

      <main id="main-content">
        <Hero />
        <MarketTicker />
        <Stats />
        <Features />
        <HowItWorks />
        <TokenMechanics />
        <CTA />
      </main>

      <Footer />
    </>
  );
}

export default App;
