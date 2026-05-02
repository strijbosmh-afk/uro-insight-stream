import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export type OnboardingStatus = {
  loading: boolean;
  shouldOpenWizard: boolean;
  needsResumeBanner: boolean;
  currentStep: number;
};

/**
 * Drives wizard auto-open + dashboard resume banner visibility.
 *
 * Wizard auto-opens when ALL true:
 *  - user is signed in
 *  - user_specialties has zero rows
 *  - user_onboarding_state.completed_at IS NULL
 *  - user_onboarding_state.skipped_at IS NULL
 *
 * Resume banner shows when:
 *  - user_onboarding_state row exists
 *  - completed_at IS NULL
 *  - (any state — covers both skipped and abandoned-mid-wizard)
 */
export function useOnboardingGate(): OnboardingStatus {
  const { user, loading: authLoading } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-state", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [stateRes, specRes] = await Promise.all([
        supabase
          .from("user_onboarding_state")
          .select("current_step, completed_at, skipped_at")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase.from("user_specialties").select("specialty_id").eq("user_id", user!.id).limit(1),
      ]);
      return {
        state: stateRes.data as
          | { current_step: number; completed_at: string | null; skipped_at: string | null }
          | null,
        hasSpecialty: (specRes.data ?? []).length > 0,
      };
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return React.useMemo(() => {
    if (authLoading || isLoading || !user) {
      return { loading: true, shouldOpenWizard: false, needsResumeBanner: false, currentStep: 1 };
    }
    const state = data?.state;
    const hasSpec = data?.hasSpecialty ?? false;
    const completed = !!state?.completed_at;
    const skipped = !!state?.skipped_at;
    const currentStep = state?.current_step ?? 1;
    const shouldOpenWizard = !completed && !skipped && !hasSpec;
    const needsResumeBanner = !completed && (skipped || (!!state && currentStep > 1));
    return { loading: false, shouldOpenWizard, needsResumeBanner, currentStep };
  }, [authLoading, isLoading, data, user]);
}