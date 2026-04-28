"use client";

import { useState } from "react";
import Image from "next/image";
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );

  function validate() {
    const next: typeof errors = {};
    if (!email.trim()) next.email = t.auth.required;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = t.auth.invalidEmail;
    if (!password) next.password = t.auth.required;
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
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      router.push("/dashboard/properties");
      router.refresh();
    } catch {
      toast.error(t.auth.tryAgain);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-0)] px-4 py-8 text-[var(--fg-0)]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line-soft) 1px, transparent 1px), linear-gradient(90deg, var(--line-soft) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "linear-gradient(180deg, transparent 0%, black 14%, black 78%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, black 14%, black 78%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-6xl flex-col">
        <header className="flex min-w-0 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={t.common.appName}
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src="/brand/reelio-logo-for-light.png"
              alt={t.common.appName}
              width={177}
              height={50}
              priority
              className="h-auto w-[116px] sm:w-[156px]"
            />
          </Link>
          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </header>

        <main className="grid min-w-0 flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-14">
          <section className="hidden lg:block">
            <motion.div
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative max-w-xl"
              aria-hidden="true"
            >
              <div className="absolute -inset-6 border border-[var(--line-soft)]" />
              <div className="relative overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] shadow-[var(--shadow-card)]">
                <div className="grid aspect-[1.24] grid-cols-[1.1fr_0.9fr]">
                  <div className="prop-img" data-tone="warm" />
                  <div className="grid grid-rows-2 border-s border-[var(--line-soft)]">
                    <div className="prop-img" data-tone="cool" />
                    <div
                      className="prop-img border-t border-[var(--line-soft)]"
                      data-tone="amber"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[var(--line-soft)] bg-[var(--bg-2)] px-5 py-4">
                  <div className="h-2.5 w-32 rounded-full bg-[var(--fg-4)]/45" />
                  <div className="flex gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--fg-4)]/55" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[var(--fg-4)]/55" />
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-full sm:max-w-[420px] lg:mx-0"
          >
            <div className="mb-6 text-center lg:text-start">
              <h1 className="text-3xl font-semibold tracking-normal text-[var(--fg-0)]">
                {t.auth.loginPrompt}
              </h1>
            </div>

            <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-1)] p-6 shadow-[var(--shadow-card)] sm:p-7">
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-5"
              >
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
                  autoComplete="current-password"
                  placeholder="••••••••"
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
                    t.auth.loginCta
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
              {t.auth.loginFooter}{" "}
              <Link
                href="/signup"
                className="text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
              >
                {t.auth.signupCta}
              </Link>
            </p>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
