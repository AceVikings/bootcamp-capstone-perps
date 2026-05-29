import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import App from './App.tsx';

const RPC_URL = import.meta.env.VITE_RPC_URL ?? 'https://api.devnet.solana.com';
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
);
