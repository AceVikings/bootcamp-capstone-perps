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

function App() {
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
