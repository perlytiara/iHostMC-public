"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { useAuthStore } from "../store/auth-store";
import { cn } from "@/lib/utils";

interface LoginFormProps {
  onSwitchToSignup?: () => void;
  onSuccess?: () => void;
  className?: string;
}

export function LoginForm({ onSwitchToSignup, onSuccess, className }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setUser = useAuthStore((s) => s.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password);
      setUser({ token: res.token, userId: res.userId, email: res.email });
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
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
          name="current-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        {onSwitchToSignup && (
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Create an account
          </button>
        )}
      </div>
    </form>
  );
}
