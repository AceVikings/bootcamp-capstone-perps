import { useState } from 'react';
import { Menu, X } from 'lucide-react';

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
];

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
            RIVEN
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
          <button className="px-6 py-2.5 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2">
            LAUNCH APP →
          </button>
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
            <button className="mt-2 px-6 py-3 border border-accent text-accent font-mono text-xs tracking-widest uppercase hover:bg-accent hover:text-void transition-colors duration-100 w-full">
              LAUNCH APP →
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
