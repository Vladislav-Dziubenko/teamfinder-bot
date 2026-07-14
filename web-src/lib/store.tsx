"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lootCases, type CaseItem } from "@/lib/data";

export type InventoryItem = CaseItem & { uid: string; id?: number };

type Nexus = {
  stars: number;
  coins: number;
  points: number;
  premiumActive: boolean;
  inventory: InventoryItem[];
  freeSearchesLeft: number;
  unlockedPlayers: string[];
  openedToday: Record<string, number>;
  loading: boolean;

  addCoins: (n: number) => void;
  addPoints: (n: number) => void;
  spendStars: (n: number) => boolean;
  spendCoins: (n: number) => boolean;
  activatePremium: () => void;
  addToInventory: (item: CaseItem) => void;
  sellItem: (uid: string) => void;
  openCase: (caseId: string) => Promise<{ ok: boolean; item?: CaseItem; error?: string }>;
  useFreeSearch: () => boolean;
  unlockPlayer: (id: string, cost: number) => boolean;
  refreshData: () => Promise<void>;
  loadLeaderboard: () => Promise<any[]>;
};

const NexusContext = createContext<Nexus | null>(null);

const FREE_SEARCHES = 5;

// API helper functions
async function apiFetch(endpoint: string, options?: RequestInit) {
  const initData = (window as any).Telegram?.WebApp?.initData || "";
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options?.headers,
      "X-Telegram-Init-Data": initData,
    },
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json();
}

export function NexusProvider({ children }: { children: ReactNode }) {
  const [stars, setStars] = useState(0);
  const [coins, setCoins] = useState(0);
  const [points, setPoints] = useState(0);
  const [premiumActive, setPremiumActive] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [freeSearchesLeft, setFreeSearchesLeft] = useState(FREE_SEARCHES);
  const [unlockedPlayers, setUnlockedPlayers] = useState<string[]>([]);
  const [openedToday, setOpenedToday] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  // Load initial data
  const refreshData = async () => {
    try {
      setLoading(true);
      
      // Load currency
      const currency = await apiFetch("/api/currency");
      setStars(currency.stars || 0);
      setCoins(currency.coins || 0);
      setPoints(currency.points || 0);
      
      // Load inventory
      const invData = await apiFetch("/api/inventory");
      setInventory(invData.inventory || []);
      
      // Load cases to check daily limits
      const casesData = await apiFetch("/api/cases");
      // openedToday will be calculated based on server data
      
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load leaderboard
  const loadLeaderboard = async () => {
    try {
      const data = await apiFetch("/api/leaderboard");
      return data.leaderboard || [];
    } catch (error) {
      console.error("Failed to load leaderboard:", error);
      return [];
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const value = useMemo<Nexus>(() => {
    const addCoins = (n: number) => setCoins((c) => c + n);
    const addPoints = (n: number) => setPoints((p) => p + n);

    const spendStars = (n: number) => {
      let ok = false;
      setStars((s) => {
        if (s >= n) {
          ok = true;
          return s - n;
        }
        return s;
      });
      return ok;
    };

    const spendCoins = (n: number) => {
      let ok = false;
      setCoins((c) => {
        if (c >= n) {
          ok = true;
          return c - n;
        }
        return c;
      });
      return ok;
    };

    const activatePremium = () => setPremiumActive(true);

    const addToInventory = (item: CaseItem) =>
      setInventory((inv) => [{ ...item, uid: `${item.key}-${Date.now()}-${Math.random()}` }, ...inv]);

    const sellItem = async (uid: string) => {
      const item = inventory.find((i) => i.uid === uid);
      if (!item) return;
      
      try {
        await apiFetch("/api/inventory/sell", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: item.id }),
        });
        setCoins((c) => c + item.sell);
        setInventory((inv) => inv.filter((i) => i.uid !== uid));
      } catch (error) {
        console.error("Failed to sell item:", error);
      }
    };

    const openCase = async (caseId: string): Promise<{ ok: boolean; item?: CaseItem; error?: string }> => {
      try {
        const response = await apiFetch("/api/cases/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ case_id: caseId }),
        });
        
        if (!response.ok) {
          return { ok: false, error: response.error || "Failed to open case" };
        }
        
        // Update local state
        if (response.item) {
          setInventory((inv) => [
            { ...response.item, uid: `${response.item.key}-${Date.now()}-${Math.random()}` },
            ...inv,
          ]);
          if (!caseId.startsWith("gold")) {
            setStars((s) => s - 0); // Free case
          } else {
            setStars((s) => s - 150); // Gold case
          }
        }
        
        await refreshData();
        return { ok: true, item: response.item };
      } catch (error) {
        console.error("Failed to open case:", error);
        return { ok: false, error: "Failed to open case" };
      }
    };

    const useFreeSearch = () => {
      let ok = false;
      setFreeSearchesLeft((n) => {
        if (n > 0) {
          ok = true;
          return n - 1;
        }
        return n;
      });
      return ok;
    };

    const unlockPlayer = (id: string, cost: number) => {
      let ok = false;
      setStars((s) => {
        if (s >= cost) {
          ok = true;
          return s - cost;
        }
        return s;
      });
      if (ok) setUnlockedPlayers((u) => (u.includes(id) ? u : [...u, id]));
      return ok;
    };

    return {
      stars,
      coins,
      points,
      premiumActive,
      inventory,
      freeSearchesLeft,
      unlockedPlayers,
      openedToday,
      loading,
      addCoins,
      addPoints,
      spendStars,
      spendCoins,
      activatePremium,
      addToInventory,
      sellItem,
      openCase,
      useFreeSearch,
      unlockPlayer,
      refreshData,
      loadLeaderboard,
    };
  }, [stars, coins, points, premiumActive, inventory, freeSearchesLeft, unlockedPlayers, openedToday, loading]);

  return <NexusContext.Provider value={value}>{children}</NexusContext.Provider>;
}

export function useNexus() {
  const ctx = useContext(NexusContext);
  if (!ctx) throw new Error("useNexus must be used within NexusProvider");
  return ctx;
}
