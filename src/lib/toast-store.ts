export type ToastVariant = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let nextId = 0;
const AUTO_DISMISS_MS = 4500;

function emit() {
  listeners.forEach((fn) => fn([...toasts]));
}

function remove(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function addToast(message: string, variant: ToastVariant = "info") {
  const id = ++nextId;
  toasts = [...toasts, { id, message, variant }];
  emit();
  setTimeout(() => remove(id), AUTO_DISMISS_MS);
  return id;
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export function dismiss(id: number) {
  remove(id);
}

export const toast = {
  success: (message: string) => addToast(message, "success"),
  error: (message: string) => addToast(message, "error"),
  info: (message: string) => addToast(message, "info"),
};
