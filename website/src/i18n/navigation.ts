// Re-export from navigation.tsx so imports to @/i18n/navigation resolve (build expects .ts)
export {
  Link,
  usePathname,
  useRouter,
  usePathnameKey,
  getLocalizedPath,
  routing,
} from "./navigation.tsx";
