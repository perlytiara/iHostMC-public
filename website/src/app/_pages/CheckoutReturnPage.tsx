"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";

const CHECKOUT_MESSAGE_ORIGIN = "*";

function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const [done, setDone] = useState(false);
  const status = searchParams.get("checkout") ?? "";

  useEffect(() => {
    if (done) return;
    const isSuccess = status === "success";
    const isCancel = status === "cancel";
    if (!isSuccess && !isCancel) return;

    if (typeof window !== "undefined" && window.opener) {
      try {
        window.opener.postMessage({ type: "ihostmc-checkout", checkout: status }, CHECKOUT_MESSAGE_ORIGIN);
      } catch {
        // ignore
      }
      window.close();
      setDone(true);
      return;
    }
    setDone(true);
  }, [status, done]);

  if (typeof window !== "undefined" && window.opener) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <p className="text-sm text-muted-foreground">Returning to app...</p>
      </div>
    );
  }

  const isSuccess = status === "success";
  const isCancel = status === "cancel";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        {isSuccess && (
          <>
            <h1 className="text-xl font-semibold text-emerald-400 mb-2">Payment successful</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your subscription is active. Return to the iHostMC app to see your updated plan.
            </p>
          </>
        )}
        {isCancel && (
          <>
            <h1 className="text-xl font-semibold text-zinc-300 mb-2">Checkout cancelled</h1>
            <p className="text-sm text-muted-foreground mb-6">You can upgrade anytime from Settings in the app.</p>
          </>
        )}
        {!isSuccess && !isCancel && (
          <>
            <h1 className="text-xl font-semibold text-zinc-300 mb-2">Checkout</h1>
            <p className="text-sm text-muted-foreground mb-6">No return status. Go to dashboard or open the app.</p>
          </>
        )}
        <Link href="/dashboard" className="inline-block rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CheckoutReturnContent />
    </Suspense>
  );
}
