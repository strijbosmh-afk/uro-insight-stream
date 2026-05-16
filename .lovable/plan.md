## Plan

### 1. Auto-logout after 30min of inactivity

Add a new hook `src/hooks/useIdleLogout.ts`:
- Tracks last-activity timestamp using listeners on `mousemove`, `keydown`, `click`, `scroll`, `touchstart`, and tab `visibilitychange`.
- 30-minute timer; on expiry, calls `supabase.auth.signOut()` and navigates to `/auth` with a toast: "Signed out after 30 minutes of inactivity."
- Resets timer on any activity. Uses `setTimeout` (not interval) for efficiency, re-armed on each activity event (throttled to ~1/sec).
- Only active when `session` exists (no-op for signed-out users).
- Persists `lastActivityAt` to `localStorage` so the timer survives reloads / cross-tab — if the user returns after >30min in another tab/refresh, log out immediately.

Wire it inside `AuthProvider` (or a small wrapper in `AppShell.tsx`) so it runs once globally for authenticated users.

### 2. Logout button under Contact

In `src/components/shell/Sidebar.tsx`, add a new `<li>` directly after the Contact button (around line 264):
- Same styling as Contact/Help/Settings rows for visual consistency.
- Uses `LogOut` icon from `lucide-react`.
- `onClick` calls `useAuth().signOut()` then navigates to `/auth`.
- Hidden when there is no active session (sidebar already only renders for signed-in users, so likely always shown — verify in Sidebar mount conditions).
- Label "Sign out"; respects `collapsed` state (icon-only when collapsed).

### Technical notes

- No backend / DB / RLS changes.
- No new dependencies.
- Idle threshold defined as `const IDLE_MS = 30 * 60 * 1000;` at top of hook for easy tuning.
- Activity listeners attached to `window` with `{ passive: true }`, cleaned up on unmount.

### Files touched

- `src/hooks/useIdleLogout.ts` (new)
- `src/auth/AuthProvider.tsx` (call hook) — or `src/components/shell/AppShell.tsx`
- `src/components/shell/Sidebar.tsx` (Sign out row)
