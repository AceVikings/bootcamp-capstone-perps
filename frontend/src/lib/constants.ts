// AUTO-GENERATED in part by scripts/seed-liquidity.ts — do not edit the mint
// sections manually. MARKETS + static config may be updated by hand.
export const PROGRAM_ID       = '9iUeMGw14CaAiASMUruBMWRR5j7HcEXwthuN5pDAo3Qf';
export const USDC_MINT        = 'GgUG99UGb2fz5vYHRGMW9yfMgtczEVNjEUhW3Vyov6yr';
/** Mock wSOL (9 dec) — custom devnet SPL token, same authority as USDC faucet. */
export const WSOL_MINT        = '58qfKJ769kMmLRAWquNFv9ViXQwzWzkdjQSTkmC84cPC';
export const SOL_ORACLE       = '5mrrNEkdHoUp7iFZ42DMJn9k46VZp5FTAnhN7BSTozse';
export const CONFIG_PDA       = 'ErhxXL9VUUBeEPu1L62hpAZJ7oGrqhGabiYZDn6g99TL';
export const FEE_TREASURY_PDA = 'CBa5y6AetSs6VpWDxgJbj9Vt8EnHiDhVhZQUSmK8Cgoz';

// ─── Market definitions ────────────────────────────────────────────────────
// feedId: 32-byte Pyth price feed ID (hex). Stored as asset_feed in vaults.
// oracle: devnet mock oracle account pubkey (created by devnet-init.ts).
// mockPriceUsd: 6-decimal USD mock price for the mock oracle account.
export interface MarketDef {
  label: string;
  feedId: string;
  oracle: string;
  mockPriceUsd: number;
}

export const MARKETS: MarketDef[] = [
  {
    label: 'BTC/USD',
    feedId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
    oracle: 'Cm3EZjU8D5MHDP6tGSZBGXEvz1rXVfAHydoepFB5hQ5t',
    mockPriceUsd: 68_420_000_000,
  },
  {
    label: 'ETH/USD',
    feedId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    oracle: '7VivVtfizWqtzyoBvsp6HS1BkEJQd26CV1cjK69ezGNh',
    mockPriceUsd: 3_847_000_000,
  },
  {
    label: 'SOL/USD',
    feedId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    oracle: '68utR51CRAH7hCHx5GS4sZvUCL4pe6h4uS1GT1t2bXkz',
    mockPriceUsd: 182_470_000,
  },
];

export const CALL_MINTS: Record<string, string> = {
  "CALL_120_2D": "6Exv9YUWp1XaFJqFYpvqjAtLM7JPeigC9AbsjEz3sdMH",
  "CALL_130_2D": "F53YxHLZpiAMz6u4A6yR9pwy2ef3kV6dgU96VYeMuHZo",
  "CALL_140_2D": "6VpPxWcgoHCPYZbiAkSH9WbsfGS8nTaHR8QCeyAfJaN5",
  "CALL_150_2D": "BZCwhWWkLgF1vfMMNbkc25G8TS5or1jRi9hBtdutfKh5",
  "CALL_160_2D": "AWQHjZAa5ocR4RTuUEpmnGc111Ft4ZbZNCuiwonkN6VR",
  "CALL_170_2D": "FWJF5r3JyGyN1gqkBeBoJwnfsVSWJo7gWf2hkuZrviEq",
  "CALL_180_2D": "29WSApjE3dpcBGzG9wcmTqiHLr4VBJKPtDDd8Vpo88wD",
  "CALL_190_2D": "H2QE9wAbw7A4YGxcMDTNDVuCzHvHafrzmSm9oqFDNXr1",
  "CALL_200_2D": "J88FkKbuxtorPtXkAAfiTBFYXsGbPLHNybMkg8RrQbrN",
  "CALL_210_2D": "CHUQKm8JJFuAm2CU9LKuXM9rmMvP1dn2EWP5XUdc4oD8",
  "CALL_220_2D": "5vcYhKXN8aes5zDxeso7TU2SVVY3RC14mKU9PvAuwM7h",
  "CALL_230_2D": "HVeBRJL4yNpNJfsqTdQMKqzeKRNCsLMHDZoAqQDv8fyV",
  "CALL_240_2D": "HejtKKyQxcDx8s9kPDvFFQgrPhWfcmXVp979f9b1FQkY",
  "CALL_120_4D": "DcaUtEiymaNGfxMmzG9wScHGXX9VCi667LGiwQvJnqA5",
  "CALL_130_4D": "BXMJzgfRHpi1DXef2uP3yxVGncdEcBNGvnX81xcodQqg",
  "CALL_140_4D": "DyUYTXYz8ttjercqK7dWJihA7UUnGFdFyLVKehq1EYFW",
  "CALL_150_4D": "3bKhS7WTWnxvzWrQavmT9EN3CjqfmGz1DvK2i3GHHNdU",
  "CALL_160_4D": "2k1TQEPtabJRhtvHXweVqBME7qkdZGon2RcerdXQh3bK",
  "CALL_170_4D": "5MTyvXNYWmSoMZVUVkebxM21GF7Pf3FDCKRV3PKb8fmX",
  "CALL_180_4D": "6RpCCBS1ASUopWuaYw7FjihLEh9B99NXJkn43KzsoGMN",
  "CALL_190_4D": "AGBTJzdsNU6C2SkPcqFYm6g74u6e5Trk8Vn3XqeS7YMR",
  "CALL_200_4D": "6mo6N7f3LfWJvzwSVxeAMeApRex6rpvQEsRKe58vRnrv",
  "CALL_210_4D": "CxETEL1ePArXZ3hqz5bPDhePEq684ZjCGLkZMNmsvs7W",
  "CALL_220_4D": "GX2EaokYDqm7g8qCTSUDqtRf79ps5KXn6GsmW7J3wVwt",
  "CALL_230_4D": "FTAtMP6YRVX9dxAzrf7Auk6sEdnwsKtZhCdRmigFxst5",
  "CALL_240_4D": "6H9ppP14iC5GGgoK3H7mbY3VRs1BiyfRLt4M6j4SNSY7",
  "CALL_120_6D": "Ecq8nPnxc2SLxsvZijRuZciotwA7dFgRPa1WXYpZBxYE",
  "CALL_130_6D": "BQWkYPBXXYoCqasnW3wPBrNLu2dQMJb4mSFMjJTb5kNU",
  "CALL_140_6D": "Cx2VRKGSrMYuEzocRAjk9cjJYpxbkWdrMYg68VZ1DxbB",
  "CALL_150_6D": "9TWByn4xhV2bteAb59aFVBuVccHSEit8Z39hZZfrdsRV",
  "CALL_160_6D": "7P2BazXW9Xou6aBRLX1MTFnCchyuW4H6mJJU5zTGc6eh",
  "CALL_170_6D": "8VZYwMJzVnLPUKDYEYQD1iu6kanMrAZ4amk7wCF4bJ2J",
  "CALL_180_6D": "3LXkmRwxqZ6btjt12dDR1ZcLoW8MQKbRyEtvgaLg98qL",
  "CALL_190_6D": "ADFBwhCfHik5goUshJVvPnDZ9NK3pdYWgmUZYdsbNKq",
  "CALL_200_6D": "3xY6Fk6gKmaADzQVeiutY2LnfbdW9XxvfmyyaZVVuYPY",
  "CALL_210_6D": "4gjWEvXV3PFtff6kcgEtG77qnYz3ThyqPwZfRinFwJ3W",
  "CALL_220_6D": "3uL9F5rixJT2ALdpXC32Ue4hQbN9ZkjZvLbPSvfh8S8T",
  "CALL_230_6D": "6jStygf5FVUj6Ug9ERYLJ6NqrnSoWEcdrKex7ruefNJB",
  "CALL_240_6D": "CSQRQ5pL2nR1hrRwBi8Ji4qkHFtGiSqkmASRxpHNvtxZ",
  "CALL_120_8D": "2rkxMiFFkLMo3VE3wVUW3vn26FjpDY1ZU6hbyLxh1ejp",
  "CALL_130_8D": "2aGrJ3tWJnVFzMj7uZCDVATqht78xAg3EuEb1qBcD78x",
  "CALL_140_8D": "EX8BNZPNCmtdohnA8C1ihD3jRhYjP7A9oZrcaygB9tQq",
  "CALL_150_8D": "4BdMrz1L6tai2dW1HLcQLK1rdPrs791aLVsMD17D4FBq",
  "CALL_160_8D": "8Fi7iYF6nAaJ8SCQ2T7NdMcgmuanGY2YgKQb8i7tigrg",
  "CALL_170_8D": "Di2ftWb2hbbjk2xjv8QWEP8SE842fWd8YocnV38nvD8S",
  "CALL_180_8D": "EPE4yXn9aC2iuiQUDrSofk95ugQYWhGkhxnnguXZroP4",
  "CALL_190_8D": "9szPMfsXdfUKqptW5BhSLttK1bWdxMfpuLCVFEEtdveY",
  "CALL_200_8D": "3Y8PQcBWo5MjhqEg6dMrEeSsUy5iqCqbbRnD9uLVrHTP",
  "CALL_210_8D": "Hr4x8ENX8RSq4iFv9LGqgpqtUgZfLybY26ib75Ayo1fq",
  "CALL_220_8D": "BY5CTk7815QLCLzgZxmPoE1Zk5vy6GuGnDEuemQvr877",
  "CALL_230_8D": "AFi2XLw4QUP6nVYuafcGZuLZjgyu6CH6pNms3rr15M6M",
  "CALL_240_8D": "DxTxWRbQZnu4Kk1mVau26z7M6cMMtdudsgeg6krG6SdF",
  "CALL_120_10D": "6ViPyjy4rwn54WtY2vu19uJjvtU77S12Nq2gpCZqeVPx",
  "CALL_130_10D": "4HbPF3hWYPB1VAxhrahoKFJbPuGzVQE1uPLheFiPRMhc",
  "CALL_140_10D": "6MQr2G4WaMGLN9gfzSeTWvxRa1NThojkTD7YzxUYopmx",
  "CALL_150_10D": "4L71pXff49Vuikza2Po4Ev74DH1jrji1LCo7KuZyhh69",
  "CALL_160_10D": "947QRN1N67J7rxLocFFhxtzzXLdiUSsKZmj6YeLLUgBS",
  "CALL_170_10D": "UKhLA3QZbCSeNGj1ez3JhPVuKWHooLmQqeVZKRH51pX",
  "CALL_180_10D": "7VxLtPrVF9pU7p9LuWXvdaayBpFKf8CFUUCyFU9965E9",
  "CALL_190_10D": "72rLjGcG7XxDM3GSpjU56PXnfHZoWoZBwCX2eJ3K4e4L",
  "CALL_200_10D": "ATjtEKpppmnQNd1U823PwFC8tXPjnZ2nctt1mw6wxqpf",
  "CALL_210_10D": "GfQP3JR2WpTsFwrpR65cWEXNyeWVJ4ZLsTsVPbt4BbiU",
  "CALL_220_10D": "7Ye8vRFGyKTnJ2hnwo48xxMu2p7EwZhd8BoRnPNriJob",
  "CALL_230_10D": "FkhRsoT6J95nzBWnAZ9trRNqrwqpNBNh6XvD2Znomzv9",
  "CALL_240_10D": "21YXWhAxPtQUengPFftpovdZgnEZkvHENtocxbckjZ5y"
};

export const PUT_MINTS: Record<string, string> = {
  "PUT_240_2D": "2QKxznRjGCWokU1EKmZRrTqKaZnrVWzsztVp8zz2AUn1",
  "PUT_230_2D": "AaU9wxn1WRvt8FXCHd3ZGkCyEWFJFsCybxwphq4SUJQk",
  "PUT_220_2D": "B47wTGumi29dNABgGe7Kz1g6zEAhwByekUTiqr4ofbHx",
  "PUT_210_2D": "8xczLBMs8CELggbDa4SVg6RoK6H4mat6sBcpWcwrvLX3",
  "PUT_200_2D": "AtViGZGRP1mJTdpmDiPorWanr5akCR2eH8TvxFxjNgB1",
  "PUT_190_2D": "29Uq2eYZMaYHKTAPRUes94kyAUZKqViWFHiacVJVHs8S",
  "PUT_180_2D": "2foqip4z2tB1XBc5ehRHME9KHm5QySRRACyAb17Q3Jtz",
  "PUT_170_2D": "Gw9J5BANHEk6ieNZRkcBQjipPZgYJ5CZ4CkwGNM4imTd",
  "PUT_160_2D": "Bz6YCNvsEN3UVL8GV9EZQnMLC8neo7SrR6gaHdS89BGw",
  "PUT_150_2D": "EvJ5GrN59U1NJQ5fPsKhpj9EWzbohamr2kzjCna4xrS4",
  "PUT_140_2D": "9gEiVehkG7BTgZRcUb9jCyQXwtJgjtbqXf4HMBZnD1it",
  "PUT_130_2D": "6RHtn49TB9Qnq1nYTKK9wZ64iz4pVmqYiidfg3QBWezL",
  "PUT_120_2D": "7Tfxw8Smvm7Wyf5zSz88K53whWFDqc4vZEaJBqVqATd2",
  "PUT_240_4D": "AunF5ZtmA5Zucvaj1MzKnfDv2KCDp7wcRKckezP4qXSW",
  "PUT_230_4D": "HnuChtVrpR8F9fGJME57KsJP9siJmutQtM2vi3zMt4wE",
  "PUT_220_4D": "7rC1w5SWSkJpz78zVcehJnLZJb1jTAJ7YbubJ483cMzP",
  "PUT_210_4D": "BnVy7YXQVvrMeZnYvjAKqYKmh6HQoezfdAymtqCsYZpn",
  "PUT_200_4D": "46z5YCqAr1TSXb9cXPxpxKhDY1v8tWHvSHrGpWCuuoS3",
  "PUT_190_4D": "6Zk1k98QmQUE2SQQ6Aw5zsBRg5sWiCw9QtsZdvrxYvXR",
  "PUT_180_4D": "5haj9Ts4RJ4S4LC2vT6KAGmnusfRR9TPSVFREHYixpMv",
  "PUT_170_4D": "AyU7UL5PQcU8rcQceHedWpGNcnLZ1xPezdzHQATmp9v3",
  "PUT_160_4D": "4Yinzgt9jAsC58f4Yi4Tr3LE7K1dSxvN6sNLM7GEWnYA",
  "PUT_150_4D": "A9jMjUZSgZ64YicSAMrnvKos6JhWbYKs1xKE3ekewkUg",
  "PUT_140_4D": "31CReqj4PxNnjNHESTDmKKRfAxxHxHjv2mh3nPNfekTN",
  "PUT_130_4D": "2ckGa3tkCfjXBaESazscpKVQ4MF9fNZH9QagaJ1rhDLM",
  "PUT_120_4D": "3mtr7otGD77HEcQzq3TrjZxY5c2bhsxgSwkpes5hEV5P",
  "PUT_240_6D": "92sQYJkH7dmuUn3KHydbPumYoQu5nZKGGgUHBtAKGbWF",
  "PUT_230_6D": "3FVmEQdAfXKe5NQvAfkWyANFHaRk9GqGgtSasEK8v8aH",
  "PUT_220_6D": "41WmN9SY892Dvu913J9abJWSmwmdKTqYcD7MoSMxFSaw",
  "PUT_210_6D": "BZiS7GXqmZnh6AuoFevQeUJZEWsBTkJbZfntACwNxQAb",
  "PUT_200_6D": "Bm5RALEJ2vWxGqALBxVeUTzZwanpZeFxV7f4gBZiyDG8",
  "PUT_190_6D": "HG1hGaZ4kMqCpC4vkTJ7nmXCTf1cW2K4KvTux3MKrWns",
  "PUT_180_6D": "4raPCVYbUkNUVU4A1PQpEggDJuAkpQFuFXqDFNQPhdPg",
  "PUT_170_6D": "DCzT8d5nDhAbi3RHykcnRqBebQmbWDagLQo5fefXTsXF",
  "PUT_160_6D": "HjifJVWg3NPaNK7Vp8AJxJyPLVnbp8oeYskGqs1sAMYu",
  "PUT_150_6D": "B7ZhG9zSkdUmYBjsrsBpHQc5Xo2xkoLUUvEXaNfaDLkL",
  "PUT_140_6D": "3yB8ieLAptwswJwJDzuAauamCpkLECMxgbQkREjfLfG9",
  "PUT_130_6D": "3E29bcP5WAAriV7nknpPXtXMzsuYosgzU2BKwNj365BV",
  "PUT_120_6D": "YNiVbUQHdTW8ZHhSa1Dg1wGdVpDbYHFUo6eY39mMkg7",
  "PUT_240_8D": "8bzaEXgi5Hpfo59Z89PMLKzzxdKecEZVxNqSCcV6AYoa",
  "PUT_230_8D": "8Wbaqfzr6bf2smqkB7xdGXKpg1VH4AfgbApQF1bnNF5u",
  "PUT_220_8D": "8EBWhsgiPgyr5CyrEnFLTu44iEqB8yAytWKXrNF1Yjb",
  "PUT_210_8D": "92taXkTECFrqk37P3tFWPvwoVz3iU32UscLHYreSqX9H",
  "PUT_200_8D": "9HZDd9hEGLkTTwrVFc9N21evxS3NvNexHxzhi5VfQL34",
  "PUT_190_8D": "Er6JCo67rgGhyRwvKdT1sgh6isjspzuhmTpA64gJgtHr",
  "PUT_180_8D": "HcmxLKL4ZrzxhCJQDZgYihExSfpYmKFSz8KsCyiTiJHG",
  "PUT_170_8D": "73DkjpcvwWxzwVJa7k8Z3xJjS3xv8XqiQiH3mnUYn251",
  "PUT_160_8D": "BAMciqEb8Rd5qpfNoHgjduoKPAar9jkcnp6anHunTkLY",
  "PUT_150_8D": "Aay8CdfZFMuNfm1kTX2Zwc3aQ8ZbjDafmkBSQAE4Adp1",
  "PUT_140_8D": "4x1pE8PFoByetyy7vtWLN3wubRGM72219jw1XjNYJBUB",
  "PUT_130_8D": "9kiiQtUZAz8pbJ8T6wTznTW1ydZsrQWeTDzqmYcRacAG",
  "PUT_120_8D": "3gKVA8TKVhJEwAn4V5umY97n61ZyJwAvJfkzxkyvzqF3",
  "PUT_240_10D": "2YDVjRT5C9k84FJHX6sPzG11e7kC8a72j24ZFA987hJi",
  "PUT_230_10D": "Fv9TKtEN9A8ovwCPUsyPLgYv2mSqLHUjnogHcaqrrL3n",
  "PUT_220_10D": "2SDqWDx6FVUUUFMdwHTfz6hyXqDPSi9LFpqg5bQtCctM",
  "PUT_210_10D": "62uQi8KrbkBWAFgXa6s2SbFtQphRTa57UQdgktHPgnd3",
  "PUT_200_10D": "Fs5tyyGxE8fLBf1qjMAq35asRGwpLTyrYHpBZSVpGS4D",
  "PUT_190_10D": "F29ZFqRtLEjcLijv9oSas7WAgZ6syA57bSMYAQAwPbz9",
  "PUT_180_10D": "ExEkbaJzy5PfZRDwKs4e6Uc3prjyiQNMuV2qimpJ4qoT",
  "PUT_170_10D": "FH72NXu7U9qZ45TdivJwWn1pQdGXLjEPQ8S6xGdif8u1",
  "PUT_160_10D": "CGdL4rKJFNTwWyJamKDs7owz6baUj4woyYe24XXFxThg",
  "PUT_150_10D": "5UGkWEgKJmQUFwNyg1mmw2XR1ZKwthL9f9WBU7eMLSr",
  "PUT_140_10D": "CRf2kJEJVkq3A3SUYZCYi865YTfHaoeUUem2zjfBAW2w",
  "PUT_130_10D": "29PvBnWcEgru3DudnWXZHD25p8k2z8oR8nxCv9jgz5Xv",
  "PUT_120_10D": "5nse2LrtMcT3NCB5UghkYPJNU815nCnqnpZVwNTtQf71"
};

export const STRIKES_USD = [120,130,140,150,160,170,180,190,200,210,220,230,240];
export const EXPIRY_DAYS = [2,4,6,8,10];
