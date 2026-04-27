"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};
    if (!fullName.trim()) next.fullName = t.auth.required;
    if (!email.trim()) next.email = t.auth.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t.auth.invalidEmail;
    if (!password) next.password = t.auth.required;
    else if (password.length < 8)
      next.password = t.auth.passwordTooShort;
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
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success(t.auth.signupSuccess);
      router.push("/login?message=check-email");
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
            {t.auth.signupPrompt}
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.3),0_8px_32px_rgba(0,0,0,0.4)]">
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label={t.auth.fullName}
              type="text"
              autoComplete="name"
              placeholder={t.auth.fullNamePlaceholder}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.fullName}
              disabled={loading}
            />

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

            <Input
              label={t.auth.password}
              type="password"
              autoComplete="new-password"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
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
                t.auth.signupCta
              )}
            </Button>
          </form>
        </div>

        {/* Footer link */}
        <p className="text-center text-sm text-[var(--color-muted)] mt-6">
          {t.auth.signupFooter}{" "}
          <Link
            href="/login"
            className="text-[var(--color-foreground)] hover:text-[var(--color-accent)] transition-colors duration-150 underline underline-offset-2"
          >
            {t.auth.loginCta}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
