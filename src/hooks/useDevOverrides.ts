import { useEffect, useState } from "react";
import {
  getDevStorageSimulateFull,
  getDevUsageUnlimited,
  subscribeDevOverrides,
} from "@/lib/dev-overrides";

export function useDevOverrides(): {
  storageSimulateFull: boolean;
  usageUnlimited: boolean;
} {
  const [storageSimulateFull, setStorageSimulateFull] = useState(getDevStorageSimulateFull);
  const [usageUnlimited, setUsageUnlimited] = useState(getDevUsageUnlimited);

  useEffect(() => {
    const sync = () => {
      setStorageSimulateFull(getDevStorageSimulateFull());
      setUsageUnlimited(getDevUsageUnlimited());
    };
    sync();
    return subscribeDevOverrides(sync);
  }, []);

  return { storageSimulateFull, usageUnlimited };
}
