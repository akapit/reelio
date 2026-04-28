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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [errors, setErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    terms?: string;
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
    if (!termsAccepted) next.terms = t.legal.termsRequired;
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

            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2.5 cursor-pointer text-sm leading-snug text-[var(--color-foreground)]">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked && errors.terms) {
                      setErrors((prev) => ({ ...prev, terms: undefined }));
                    }
                  }}
                  disabled={loading}
                  aria-invalid={errors.terms ? true : undefined}
                  aria-describedby={errors.terms ? "terms-error" : undefined}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span>
                  {t.legal.termsAcceptLabel
                    .split(/(\{terms\}|\{privacy\})/)
                    .map((part, i) => {
                      if (part === "{terms}") {
                        return (
                          <Link
                            key={i}
                            href="/terms"
                            target="_blank"
                            className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
                          >
                            {t.legal.termsLink}
                          </Link>
                        );
                      }
                      if (part === "{privacy}") {
                        return (
                          <Link
                            key={i}
                            href="/privacy"
                            target="_blank"
                            className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
                          >
                            {t.legal.privacyLink}
                          </Link>
                        );
                      }
                      return <span key={i}>{part}</span>;
                    })}
                </span>
              </label>
              {errors.terms && (
                <p
                  id="terms-error"
                  role="alert"
                  className="text-xs text-red-400 leading-snug"
                >
                  {errors.terms}
                </p>
              )}
            </div>

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

        <p className="mt-3 text-center text-xs text-[var(--color-muted)]">
          {t.legal.signupDisclosure
            .split(/(\{terms\}|\{privacy\})/)
            .map((part, i) => {
              if (part === "{terms}") {
                return (
                  <Link
                    key={i}
                    href="/terms"
                    className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
                  >
                    {t.legal.termsLink}
                  </Link>
                );
              }
              if (part === "{privacy}") {
                return (
                  <Link
                    key={i}
                    href="/privacy"
                    className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
                  >
                    {t.legal.privacyLink}
                  </Link>
                );
              }
              return <span key={i}>{part}</span>;
            })}
        </p>
      </motion.div>
    </div>
  );
}
