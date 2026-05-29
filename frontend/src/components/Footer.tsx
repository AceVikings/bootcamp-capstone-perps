import { FolderGit2, X as XIcon } from 'lucide-react';

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
      <path d="M 16 4 L 28 16 L 4 16 Z" fill="currentColor" />
      <path d="M 4 16 L 16 28 L 28 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="miter" />
      <line x1="4" y1="16" x2="28" y2="16" stroke="#080710" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

const FOOTER_LINKS = {
  Protocol: ['Overview', 'Token Mechanics', 'Risk Framework', 'Roadmap'],
  Developers: ['Documentation', 'SDK', 'API Reference', 'GitHub'],
  Community: ['Twitter / X', 'Discord', 'Forum', 'Blog'],
  Legal: ['Terms of Use', 'Privacy Policy', 'Risk Disclosure'],
};

export function Footer() {
  return (
    <footer className="bg-void border-t-4 border-accent" aria-label="Site footer">

      {/* Main footer content */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-10 lg:gap-8">

          {/* Brand column */}
          <div className="lg:pr-8">
            <a href="#" className="flex items-center gap-2.5 mb-6 group">
              <LogoMark className="text-accent group-hover:opacity-80 transition-opacity duration-100" />
              <span className="font-mono text-accent text-sm tracking-[0.2em] uppercase">
                RIVEN
              </span>
            </a>
            <p className="font-display text-sm text-fg-muted leading-relaxed mb-6">
              Tokenized Perpetual Positions. The first perpetuals protocol where
              both legs of every trade are transferable SPL tokens.
            </p>
            {/* Social icons */}
            <div className="flex gap-3">
              {[
                { Icon: FolderGit2, label: 'GitHub' },
                { Icon: XIcon, label: 'Twitter / X' },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-9 h-9 border border-accent/50 flex items-center justify-center text-accent/80 hover:border-accent hover:text-accent transition-colors duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
                >
                  <Icon size={16} strokeWidth={1.5} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <div className="font-mono text-xs tracking-widest uppercase text-fg/65 mb-5">
                {group}
              </div>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="font-display text-sm text-fg/75 hover:text-fg transition-colors duration-150 focus-visible:outline-none focus-visible:underline focus-visible:decoration-accent"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-accent/20">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-5 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="font-mono text-xs text-fg/60 tracking-wide">
            © 2026 RIVEN. All rights reserved.
          </span>
          <div className="flex items-center gap-6">
            <span className="font-mono text-xs text-fg/60 tracking-widest uppercase">
              Built on Solana
            </span>
            <span className="w-px h-3 bg-accent/30" />
            <span className="font-mono text-xs text-fg/60 tracking-widest uppercase">
              Audited
            </span>
            <span className="w-px h-3 bg-accent/30" />
            <span className="font-mono text-xs text-fg/60 tracking-widest uppercase">
              Non-Custodial
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
