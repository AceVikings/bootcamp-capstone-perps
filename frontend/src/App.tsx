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
import { Docs } from './pages/Docs';

function useHashPage() {
  const [page, setPage] = useState<'home' | 'docs'>(
    () => window.location.hash === '#/docs' ? 'docs' : 'home'
  );

  useEffect(() => {
    const onHash = () => {
      setPage(window.location.hash === '#/docs' ? 'docs' : 'home');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '';
    setPage('home');
    window.scrollTo({ top: 0 });
  }, []);

  return { page, goHome };
}

function App() {
  const { page, goHome } = useHashPage();

  if (page === 'docs') {
    return <Docs onBack={goHome} />;
  }

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
