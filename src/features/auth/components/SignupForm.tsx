"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAuthStore } from "../store/auth-store";
import { cn } from "@/lib/utils";

interface SignupFormProps {
  onSwitchToLogin?: () => void;
  onSuccess?: () => void;
  className?: string;
}

export function SignupForm({ onSwitchToLogin, onSuccess, className }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await api.register(email.trim(), password);
      setUser({ token: res.token, userId: res.userId, email: res.email });
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          name="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="mt-0.5 text-xs text-muted-foreground">At least 8 characters</p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Confirm password</label>
        <input
          name="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
        {onSwitchToLogin && (
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
    </form>
  );
}
