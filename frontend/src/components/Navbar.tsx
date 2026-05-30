import { useState, useRef, useEffect } from 'react';
import { Menu, X, ChevronDown, LogOut, LayoutDashboard, Briefcase } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Upper half: filled */}
      <path d="M 16 4 L 28 16 L 4 16 Z" fill="currentColor" />
      {/* Lower half: outlined */}
      <path d="M 4 16 L 16 28 L 28 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      {/* Invariant split line */}
      <line x1="4" y1="16" x2="28" y2="16" stroke="#080710" strokeWidth="1.6" />
      {/* Center anchor */}
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: 'Protocol', href: '#protocol' },
  { label: 'Mechanics', href: '#mechanics' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Docs', href: '#/docs' },
  { label: 'Options Chain', href: '#/app/chain' },
];

function truncatePk(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function ProfileDropdown() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!connected || !publicKey) {
    return (
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent/70 font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-100"
        >
          Wallet
          <ChevronDown size={11} className={`transition-transform duration-100 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-void border border-accent/30 shadow-lg z-50">
            <a
              href="#/app"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 font-mono text-xs tracking-widest uppercase text-fg/70 hover:text-fg hover:bg-surface transition-colors border-b border-accent/10"
            >
              <LayoutDashboard size={12} />
              App
            </a>
            <button
              onClick={() => { setVisible(true); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 font-mono text-xs tracking-widest uppercase text-accent/80 hover:text-accent hover:bg-surface transition-colors"
            >
              Connect Wallet
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 border border-accent/60 text-accent font-mono text-xs tracking-widest uppercase hover:border-accent transition-colors duration-100"
      >
        <span className="w-1.5 h-1.5 bg-bull rounded-full shrink-0" />
        {truncatePk(publicKey.toBase58())}
        <ChevronDown size={11} className={`transition-transform duration-100 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-void border border-accent/30 shadow-lg z-50">
          <a
            href="#/app"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 font-mono text-xs tracking-widest uppercase text-fg/70 hover:text-fg hover:bg-surface transition-colors border-b border-accent/10"
          >
            <LayoutDashboard size={12} />
            App
          </a>
          <a
            href="#/app/portfolio"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 font-mono text-xs tracking-widest uppercase text-fg/70 hover:text-fg hover:bg-surface transition-colors border-b border-accent/10"
          >
            <Briefcase size={12} />
            Portfolio
          </a>
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-3 font-mono text-xs tracking-widest uppercase text-fg/50 hover:text-bear hover:bg-surface transition-colors"
          >
            <LogOut size={12} />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 w-full z-50 bg-void/90 backdrop-blur-sm border-b border-accent/20">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-4 flex items-center justify-between">

        {/* Logo */}
        <a
          href="#"
          className="flex items-center gap-2.5 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-4"
        >
          <LogoMark className="text-accent group-hover:opacity-80 transition-opacity duration-100" />
          <span className="font-mono text-accent text-sm tracking-[0.2em] uppercase">
            RAVEN
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-mono text-xs tracking-widest uppercase text-fg/70 hover:text-fg transition-colors duration-150 focus-visible:outline-none focus-visible:border-b focus-visible:border-accent"
            >
              {link.label}
            </a>
          ))}
          <ProfileDropdown />
        </div>

        {/* Mobile toggle */}
        <button
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="md:hidden text-accent p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {open
            ? <X size={20} strokeWidth={1.5} />
            : <Menu size={20} strokeWidth={1.5} />
          }
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-accent/20 bg-void">
          <div className="px-6 py-6 flex flex-col gap-5">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="font-mono text-xs tracking-widest uppercase text-fg/75 hover:text-fg transition-colors"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#/app"
              onClick={() => setOpen(false)}
              className="mt-2 px-6 py-3 border border-accent/40 text-accent/70 font-mono text-xs tracking-widest uppercase hover:border-accent hover:text-accent transition-colors duration-100 w-full text-center"
            >
              App
            </a>
            <a
              href="#/app/portfolio"
              onClick={() => setOpen(false)}
              className="px-6 py-3 border border-accent/20 text-fg/60 font-mono text-xs tracking-widest uppercase hover:border-accent/60 hover:text-fg transition-colors duration-100 w-full text-center"
            >
              Portfolio
            </a>
            <div className="mt-2">
              <ProfileDropdown />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
