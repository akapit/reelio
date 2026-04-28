"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { t } = useI18n();
  const [errors, setErrors] = useState<{ email?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = t.auth.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t.auth.invalidEmail;
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
      // Always show the success state regardless of whether the email exists,
      // to avoid leaking which addresses are registered.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      setSent(true);
    } catch {
      toast.error(t.auth.tryAgain);
    } finally {
      setLoading(false);
    }
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
            {sent ? t.auth.resetEmailSent : t.auth.forgotPasswordPrompt}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.4)]">
          {sent ? (
            <p className="text-sm text-[var(--color-foreground)] leading-relaxed">
              {t.auth.resetEmailSentBody}
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <Input
                label={t.auth.email}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
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
                  t.auth.sendResetLink
                )}
              </Button>
            </form>
          )}
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-[var(--color-muted)] mt-6">
          <Link
            href="/login"
            className="text-[var(--color-foreground)] hover:text-[var(--color-accent)] transition-colors duration-150 underline underline-offset-2"
          >
            {t.auth.backToSignIn}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
