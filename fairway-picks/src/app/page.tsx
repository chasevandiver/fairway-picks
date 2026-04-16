import { App } from './AppShell'

// Next.js requires the default export of a page file to satisfy PageProps,
// so App lives in AppShell.tsx (a plain component file) and we just render it here.
export default function Page() {
  return <App />
}
