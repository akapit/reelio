"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

const LAST_UPDATED = "2026-04-28";
const VERSION = "1.0";

function PrivacyEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-xl font-semibold">1. Introduction</h2>
        <p>
          This Privacy Policy explains how Reelio (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, &ldquo;our&rdquo;) collects, uses, shares and
          protects your personal information when you use our services. We are
          committed to handling your data in accordance with the Israeli Privacy
          Protection Law, 5741-1981, including Amendment 13 (effective August
          14, 2025), and other applicable laws.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. Information we collect</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>Information you provide directly: full name, email address, password.</li>
          <li>Photos and other media you upload to generate content.</li>
          <li>
            Generated outputs (enhanced images, videos, voiceovers) and the
            prompts and settings used to create them.
          </li>
          <li>Technical information: IP address, browser, device, language preference.</li>
          <li>Cookies and similar tracking technologies.</li>
          <li>Service usage data, including dates and types of generations performed.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. How we use your information</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>To provide, maintain and improve the service.</li>
          <li>To process AI generations and deliver outputs to you.</li>
          <li>To authenticate you and secure your account.</li>
          <li>To communicate with you about your account, support and service updates.</li>
          <li>To analyze usage and improve performance and reliability.</li>
          <li>To comply with legal obligations and enforce our terms.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. Sharing with third-party service providers</h2>
        <p>
          We share your information only with vetted service providers who
          process it on our behalf and under contractual confidentiality
          obligations. These include:
        </p>
        <ul className="list-disc space-y-1 ps-6">
          <li>
            <strong>Supabase</strong> &mdash; database hosting and authentication.
          </li>
          <li>
            <strong>Cloudflare R2</strong> &mdash; storage of uploaded and generated media.
          </li>
          <li>
            <strong>Trigger.dev</strong> &mdash; orchestration of background jobs.
          </li>
          <li>
            <strong>kie.ai</strong> &mdash; AI image and video generation models.
          </li>
          <li>
            <strong>ElevenLabs</strong> &mdash; voiceover and background music generation.
          </li>
          <li>
            <strong>Google Cloud Vision</strong> &mdash; image analysis.
          </li>
          <li>
            <strong>Anthropic</strong> &mdash; cinematography prompt generation.
          </li>
          <li>
            <strong>Vercel</strong> &mdash; application hosting and analytics.
          </li>
        </ul>
        <p className="mt-3">
          We may also disclose information when required by law, court order or
          a valid request from a competent authority.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. Data security</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>SSL/TLS encryption for data in transit.</li>
          <li>Encrypted storage of credentials and sensitive data at rest.</li>
          <li>Row-level access controls in our database.</li>
          <li>Regular security reviews of our infrastructure and dependencies.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. Your rights</h2>
        <p>Under Israeli privacy law you have the right to:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>Access the personal information we hold about you.</li>
          <li>Request correction of inaccurate information.</li>
          <li>Request deletion of your information.</li>
          <li>Object to certain processing activities.</li>
          <li>Receive a portable copy of your information.</li>
          <li>Withdraw consent where processing is based on consent.</li>
        </ul>
        <p className="mt-3 font-medium">We will respond to verified requests within 30 days.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. Cookies and tracking</h2>
        <p>We use cookies and similar technologies to:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>Maintain your sign-in session and preferences (including language).</li>
          <li>Analyze usage and improve the service.</li>
        </ul>
        <p className="mt-3">
          You can control cookies through your browser settings. Blocking
          essential cookies may affect functionality of the service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. Data retention</h2>
        <p>
          We retain your personal information for as long as your account is
          active and for the period required to provide the service, comply with
          legal obligations, resolve disputes and enforce our agreements.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. International transfers</h2>
        <p>
          Some of our service providers operate outside Israel. When personal
          information is transferred abroad we take reasonable steps to ensure
          it remains protected in line with this policy and applicable law.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. The &ldquo;Last
          updated&rdquo; date at the top of this page reflects the latest
          revision. Material changes will be communicated through the service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. Contact</h2>
        <p>
          For privacy-related questions or to exercise your rights, contact us
          at{" "}
          <a
            href="mailto:support@reelio.com"
            className="underline underline-offset-2 hover:text-[var(--color-accent)]"
          >
            support@reelio.com
          </a>
          .
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--line-soft)] pt-6">
        <h2 className="mb-3 text-xl font-semibold">12. Legal provisions</h2>
        <h3 className="mt-2 mb-1 font-semibold">Severability</h3>
        <p>
          If any provision of this document is determined to be invalid or
          unenforceable, the remaining provisions shall remain in full force and
          effect.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">Governing law and jurisdiction</h3>
        <p>
          This document is governed by the laws of the State of Israel.
          Exclusive jurisdiction shall be with the competent courts of Tel
          Aviv-Jaffa.
        </p>
      </section>
    </>
  );
}

function PrivacyHe() {
  return (
    <>
      <p className="mb-6 text-sm text-[var(--color-muted)]">
        האמור במסמך זה בלשון זכר מתייחס לנשים וגברים כאחד, והשימוש בלשון זכר נעשה
        מטעמי נוחות בלבד.
      </p>

      <section>
        <h2 className="mb-3 text-xl font-semibold">1. מבוא</h2>
        <p>
          מדיניות פרטיות זו מסבירה כיצד Reelio (&ldquo;אנו&rdquo;,
          &ldquo;אנחנו&rdquo;, &ldquo;שלנו&rdquo;) אוספת, משתמשת, חולקת ומגנה
          על המידע האישי שלך בעת השימוש בשירות. אנו פועלים לטיפול במידע בהתאם
          לחוק הגנת הפרטיות, התשמ&quot;א-1981, לרבות תיקון 13 (החל מיום 14
          באוגוסט 2025), ולחוקים נוספים החלים עלינו.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">2. המידע שאנו אוספים</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>מידע שאתה מספק/ת ישירות: שם מלא, כתובת אימייל וסיסמה.</li>
          <li>תמונות וחומרים אחרים שאתה מעלה לצורך יצירת תוכן.</li>
          <li>
            תוצרים שנוצרו עבורך (תמונות משופרות, סרטונים, קריינויות) והגדרות
            ופרומפטים ששימשו ליצירתם.
          </li>
          <li>מידע טכני: כתובת IP, דפדפן, מכשיר, העדפת שפה.</li>
          <li>עוגיות וטכנולוגיות מעקב דומות.</li>
          <li>נתוני שימוש בשירות, לרבות מועדים וסוגי הפקות.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">3. כיצד אנו משתמשים במידע</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>לאספקת השירות, תחזוקתו ושיפורו.</li>
          <li>לעיבוד הפקות AI ומסירת התוצרים אליך.</li>
          <li>לאימות זהותך ואבטחת חשבונך.</li>
          <li>לתקשורת בנוגע לחשבון, תמיכה ועדכוני שירות.</li>
          <li>לניתוח שימוש ושיפור ביצועים ויציבות.</li>
          <li>לעמידה בחובות חוקיות ולאכיפת תנאי השירות.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">4. שיתוף עם ספקי שירות חיצוניים</h2>
        <p>
          אנו משתפים מידע אך ורק עם ספקי שירות שנבחרו בקפידה ומעבדים את המידע
          בשמנו ובכפוף להתחייבויות סודיות. הספקים כוללים:
        </p>
        <ul className="list-disc space-y-1 ps-6">
          <li><strong>Supabase</strong> &mdash; אחסון מסד נתונים ואימות.</li>
          <li><strong>Cloudflare R2</strong> &mdash; אחסון של מדיה שהועלתה ושנוצרה.</li>
          <li><strong>Trigger.dev</strong> &mdash; תזמור משימות רקע.</li>
          <li><strong>kie.ai</strong> &mdash; מודלים של יצירת תמונה ווידאו.</li>
          <li><strong>ElevenLabs</strong> &mdash; יצירת קריינות ומוזיקת רקע.</li>
          <li><strong>Google Cloud Vision</strong> &mdash; ניתוח תמונות.</li>
          <li><strong>Anthropic</strong> &mdash; כתיבת פרומפטים קולנועיים.</li>
          <li><strong>Vercel</strong> &mdash; אירוח האפליקציה ואנליטיקה.</li>
        </ul>
        <p className="mt-3">
          ייתכן שנחשוף מידע גם כאשר נדרש לכך על פי דין, צו שיפוטי או דרישה
          מרשות מוסמכת.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">5. אבטחת מידע</h2>
        <ul className="list-disc space-y-1 ps-6">
          <li>הצפנת SSL/TLS למידע בתעבורה.</li>
          <li>אחסון מוצפן של פרטי כניסה ומידע רגיש.</li>
          <li>בקרות גישה ברמת השורה במסד הנתונים.</li>
          <li>סקירות אבטחה תקופתיות לתשתיות ולתלויות שלנו.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">6. הזכויות שלך</h2>
        <p>בהתאם לחוק הגנת הפרטיות הישראלי עומדות לך הזכויות הבאות:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>לעיין במידע האישי שאנו מחזיקים אודותיך.</li>
          <li>לבקש תיקון מידע שאינו מדויק.</li>
          <li>לבקש מחיקה של המידע שלך.</li>
          <li>להתנגד לפעולות עיבוד מסוימות.</li>
          <li>לקבל עותק נייד של המידע שלך.</li>
          <li>לחזור בך מהסכמה שניתנה כבסיס לעיבוד.</li>
        </ul>
        <p className="mt-3 font-medium">נענה לבקשות מאומתות בתוך 30 יום.</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">7. עוגיות ומעקב</h2>
        <p>אנו משתמשים בעוגיות ובטכנולוגיות דומות כדי:</p>
        <ul className="list-disc space-y-1 ps-6">
          <li>לשמור על הסשן וההעדפות שלך (כולל שפה).</li>
          <li>לנתח שימוש ולשפר את השירות.</li>
        </ul>
        <p className="mt-3">
          ניתן לשלוט בעוגיות דרך הגדרות הדפדפן. חסימת עוגיות חיוניות עלולה
          להשפיע על תפקוד השירות.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. שמירת מידע</h2>
        <p>
          אנו שומרים את המידע האישי שלך כל עוד חשבונך פעיל ולמשך הזמן הנדרש
          למתן השירות, לעמידה בחובות חוקיות, ליישוב מחלוקות ולאכיפת ההסכמים
          בינינו.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">9. העברות בין-לאומיות</h2>
        <p>
          חלק מספקי השירות שלנו פועלים מחוץ לישראל. בהעברת מידע אישי לחו&quot;ל
          אנו נוקטים אמצעים סבירים כדי שהמידע יישאר מוגן בהתאם למדיניות זו
          ולחוק החל.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">10. שינויים במדיניות זו</h2>
        <p>
          אנו עשויים לעדכן מדיניות זו מעת לעת. תאריך &ldquo;עודכן
          לאחרונה&rdquo; בראש העמוד משקף את העדכון האחרון. שינויים מהותיים
          יובאו לידיעתך באמצעות השירות.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">11. יצירת קשר</h2>
        <p>
          לשאלות בנושאי פרטיות או למימוש זכויותיך, ניתן לפנות אלינו בכתובת{" "}
          <a
            href="mailto:support@reelio.com"
            className="underline underline-offset-2 hover:text-[var(--color-accent)]"
          >
            support@reelio.com
          </a>
          .
        </p>
      </section>

      <section className="mt-10 border-t border-[var(--line-soft)] pt-6">
        <h2 className="mb-3 text-xl font-semibold">12. הוראות משפטיות</h2>
        <h3 className="mt-2 mb-1 font-semibold">הפרדה</h3>
        <p>
          אם ייקבע כי הוראה כלשהי במסמך זה אינה תקפה או אינה ניתנת לאכיפה, יישארו
          שאר ההוראות בתוקפן המלא.
        </p>
        <h3 className="mt-4 mb-1 font-semibold">דין וסמכות שיפוט</h3>
        <p>
          מסמך זה כפוף לחוקי מדינת ישראל. סמכות השיפוט הבלעדית תהיה לבתי
          המשפט המוסמכים בתל אביב-יפו.
        </p>
      </section>
    </>
  );
}

export default function PrivacyPage() {
  const { t, locale } = useI18n();

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg-0)] px-4 py-8 text-[var(--fg-0)]">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-4xl flex-col">
        <header className="flex min-w-0 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={t.common.appName}
            className="inline-flex min-w-0 items-center"
          >
            <Image
              src="/brand/reelio-logo-for-light.png"
              alt={t.common.appName}
              width={221}
              height={62}
              priority
              className="h-auto w-[148px] sm:w-[190px]"
            />
          </Link>
          <div className="shrink-0">
            <LanguageSwitcher />
          </div>
        </header>

        <motion.main
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 py-10 lg:py-14"
        >
          <div className="mb-8">
            <h1 className="mb-2 text-3xl font-semibold tracking-normal">
              {t.legal.privacyTitle}
            </h1>
            <p className="text-sm text-[var(--color-muted)]">
              {t.legal.lastUpdated}: {LAST_UPDATED} &middot; {t.legal.version} {VERSION}
            </p>
          </div>

          <article className="space-y-8 text-base leading-relaxed text-[var(--fg-0)]">
            {locale === "he" ? <PrivacyHe /> : <PrivacyEn />}
          </article>

          <p className="mt-12 text-xs text-[var(--color-muted)]">
            {t.legal.notLegalAdvice}
          </p>

          <div className="mt-10 flex items-center justify-between gap-4">
            <Link
              href="/login"
              className="text-sm text-[var(--color-foreground)] underline underline-offset-2 transition-colors duration-150 hover:text-[var(--color-accent)]"
            >
              {t.auth.backToSignIn}
            </Link>
            <LanguageSwitcher />
          </div>
        </motion.main>
      </div>
    </div>
  );
}
