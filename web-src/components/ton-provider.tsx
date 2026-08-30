"use client"

import { TonConnectUIProvider } from "@tonconnect/ui-react"

export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  return (
    <TonConnectUIProvider manifestUrl="https://teamfinder-bot-1-9pol.onrender.com/tonconnect-manifest.json">
      {children}
    </TonConnectUIProvider>
  )
}
