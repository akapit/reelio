"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const { t } = useI18n();
  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  // Anyone reaching this page directly (without going through the email link
  // → /auth/callback) won't have a session — there's nothing to update, so
  // bounce them to /forgot-password.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/forgot-password");
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  function validate() {
    const next: typeof errors = {};
    if (!password) next.password = t.auth.required;
    else if (password.length < 8) next.password = t.auth.passwordTooShort;
    if (!confirmPassword) next.confirmPassword = t.auth.required;
    else if (password && confirmPassword !== password)
      next.confirmPassword = t.auth.passwordMismatch;
    return next;
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(t.auth.passwordUpdated);
      router.push("/dashboard/properties");
      router.refresh();
    } catch {
      toast.error(t.auth.tryAgain);
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-[var(--color-background)]">
        <Loader2
          size={24}
          className="animate-spin text-[var(--color-muted)]"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16 bg-[var(--color-background)]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        {/* Wordmark */}
        <div className="text-center mb-8">
          <div className="mb-5 flex justify-center">
            <LanguageSwitcher />
          </div>
          <span
            className="text-4xl font-medium tracking-[0.06em] text-[var(--color-accent)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            reelio
          </span>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {t.auth.resetPasswordPrompt}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.4)]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label={t.auth.newPassword}
              type="password"
              autoComplete="new-password"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              disabled={loading}
            />

            <Input
              label={t.auth.confirmPassword}
              type="password"
              autoComplete="new-password"
              placeholder={t.auth.passwordPlaceholder}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              disabled={loading}
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full mt-1"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {t.common.loading}
                </>
              ) : (
                t.auth.updatePassword
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
