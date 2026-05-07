import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // SSR/initial: send to dashboard. On the client we re-route mobile
    // viewports to the live feed (see component below) so iOS / small
    // screens land on the most time-sensitive view.
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      throw redirect({ to: "/feed" });
    }
    throw redirect({ to: "/dashboard" });
  },
});